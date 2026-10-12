// entries.save and entries.undo against SPEC 3 and 4.1–4.2.
import { describe, expect, it } from 'vitest'
import { api } from '../convex/_generated/api'
import type { Id } from '../convex/_generated/dataModel'
import { errorOf, opId, setup, upload } from './setup'

describe('entries.save', () => {
  it('writes a price, bumps rev, fieldRevs and contentRev, and logs one change', async () => {
    const { t, as, entries } = await setup()
    const entry = entries['menu-saibling']!
    const result = await as.cook.mutation(api.entries.save, {
      site: 'restaurant', opId: opId(), task: 'menu.price', entry, baseRev: 1, fields: { price: { amount: 1450 } }, sentence: 'Preis Saibling 14,50 €',
    })
    expect(result).toMatchObject({ rev: 2, contentRev: 2, warnings: [] })
    const [row, changes] = await t.run(async (ctx) => [await ctx.db.get(entry), await ctx.db.query('changes').collect()] as const)
    expect(row).toMatchObject({ rev: 2, data: { price: { amount: 1450 } } })
    expect(row!.fieldRevs.price).toBe(2)
    expect(row!.fieldRevs.name).toBe(1)
    expect(changes).toHaveLength(1)
    expect(changes[0]).toMatchObject({ kind: 'save', fields: ['price'], before: { price: { amount: 1350 } }, after: { price: { amount: 1450 } } })
  })

  it('a retry with the same opId returns the stored result and writes nothing twice', async () => {
    const { t, as, entries } = await setup()
    const args = { site: 'restaurant', opId: opId(), task: 'menu.price', entry: entries['menu-saibling']!, baseRev: 1, fields: { price: { amount: 1450 } }, sentence: 'x' }
    const first = await as.cook.mutation(api.entries.save, args)
    expect(await as.cook.mutation(api.entries.save, args)).toEqual(first)
    expect(await t.run((ctx) => ctx.db.query('changes').collect())).toHaveLength(1)
    expect((await errorOf(as.cook.mutation(api.entries.save, { ...args, fields: { price: { amount: 999 } } }))).code).toBe('OP_REUSED')
  })

  it('the same values again change no revision and log nothing', async () => {
    const { t, as, entries } = await setup()
    const result = await as.owner.mutation(api.entries.save, {
      site: 'restaurant', opId: opId(), entry: entries['menu-saibling']!, baseRev: 1, fields: { price: { amount: 1350 } }, sentence: 'x',
    })
    expect(result).toMatchObject({ rev: 1, contentRev: 1 })
    expect(await t.run((ctx) => ctx.db.query('changes').collect())).toHaveLength(0)
  })

  it('a field changed since baseRev is a conflict with the current state; other fields are not', async () => {
    const { as, entries } = await setup()
    const entry = entries['menu-saibling']!
    await as.owner.mutation(api.entries.save, { site: 'restaurant', opId: opId(), entry, baseRev: 1, fields: { price: { amount: 1500 } }, sentence: 'Wirtin' })
    const conflict = await errorOf(as.cook.mutation(api.entries.save, { site: 'restaurant', opId: opId(), task: 'menu.price', entry, baseRev: 1, fields: { price: { amount: 1600 } }, sentence: 'Koch' }))
    expect(conflict).toMatchObject({ code: 'CHANGED_SINCE', details: { rev: 2, conflicts: ['price'] } })
    // The cook edits the name from the same stale base: no conflict, the name was not touched since.
    await expect(as.cook.mutation(api.entries.save, { site: 'restaurant', opId: opId(), task: 'menu.edit', entry, baseRev: 1, fields: { veg: 'vegetarian' }, sentence: 'Koch' })).resolves.toMatchObject({ rev: 3 })
  })

  it.each([
    { who: 'cook', task: 'menu.price', fields: { name: { de: 'Neu' } }, why: 'field outside the task' },
    { who: 'cook', task: undefined, fields: { price: { amount: 1 } }, why: 'staff without task' },
    { who: 'cook', task: 'hours.closedToday', fields: { price: { amount: 1 } }, why: 'task of another brick, not granted' },
    { who: 'stranger', task: undefined, fields: { price: { amount: 1 } }, why: 'member of another site' },
  ] as const)('FORBIDDEN: $why', async ({ who, task, fields }) => {
    const { as, entries } = await setup()
    const call = as[who].mutation(api.entries.save, { site: 'restaurant', opId: opId(), ...(task ? { task } : {}), entry: entries['menu-saibling']!, baseRev: 1, fields, sentence: 'x' })
    expect((await errorOf(call)).code).toBe('FORBIDDEN')
  })

  it('an entry of another site is NOT_FOUND, even for its owner via the wrong site slug', async () => {
    const { as, entries } = await setup()
    const call = as.stranger.mutation(api.entries.save, { site: 'andere', opId: opId(), entry: entries['menu-saibling']!, baseRev: 1, fields: { price: { amount: 1 } }, sentence: 'x' })
    expect((await errorOf(call)).code).toBe('NOT_FOUND')
  })

  it('rejects invalid data and the fixed slug', async () => {
    const { as, entries } = await setup()
    const base = { site: 'restaurant', entry: entries['menu-saibling']!, baseRev: 1, sentence: 'x' }
    expect(await errorOf(as.owner.mutation(api.entries.save, { ...base, opId: opId(), fields: { price: { amount: 12.5 } } }))).toMatchObject({ code: 'INVALID' })
    expect(await errorOf(as.owner.mutation(api.entries.save, { ...base, opId: opId(), fields: { surprise: 1 } }))).toMatchObject({ code: 'INVALID' })
    expect(await errorOf(as.owner.mutation(api.entries.save, { ...base, entry: entries.weinabend!, opId: opId(), fields: { slug: { de: 'neu' } } }))).toMatchObject({ code: 'INVALID', details: { field: 'slug' } })
  })
})

describe('translations (SPEC 3 prints)', () => {
  it('a German change makes the English name stale; confirm makes it fresh again; undo restores the old print', async () => {
    const { t, as, entries } = await setup()
    const entry = entries['menu-saibling']!
    const printsOf = async () => (await t.run((ctx) => ctx.db.get(entry)))!.prints
    const fresh = (await printsOf()).name!.en

    await as.owner.mutation(api.entries.save, { site: 'restaurant', opId: opId(), entry, baseRev: 1, fields: { name: { de: 'Gebeizter Bachsaibling', en: 'Cured char' } }, sentence: 'x' })
    // The whole value was sent, but English did not change: its print stays, so it is now stale.
    expect((await printsOf()).name!.en).toBe(fresh)

    const stale = await errorOf(as.owner.mutation(api.entries.save, { site: 'restaurant', opId: opId(), entry, baseRev: 2, fields: {}, confirm: ['name'], sentence: 'x' }))
    expect(stale.code).toBe('INVALID') // confirm needs a foreign locale

    const confirmed = await as.owner.mutation(api.entries.save, { site: 'restaurant', opId: opId(), entry, baseRev: 2, fields: {}, locale: 'en', confirm: ['name'], sentence: 'Englisch bestätigt' })
    expect(confirmed).toMatchObject({ rev: 3, contentRev: 3 })
    const confirmedPrint = (await printsOf()).name!.en
    expect(confirmedPrint).not.toBe(fresh)

    const change = await t.run(async (ctx) => (await ctx.db.query('changes').collect()).find((c) => c.kind === 'save'))
    // Undo of the German change: blocked, the confirm changed `name` since (fieldRevs).
    expect((await errorOf(as.owner.mutation(api.entries.undo, { site: 'restaurant', opId: opId(), change: change!._id }))).code).toBe('CHANGED_SINCE')
  })

  it('undo restores value and print exactly and never confirms', async () => {
    const { t, as, entries } = await setup()
    const entry = entries['menu-saibling']!
    const before = (await t.run((ctx) => ctx.db.get(entry)))!
    await as.owner.mutation(api.entries.save, { site: 'restaurant', opId: opId(), entry, baseRev: 1, locale: 'en', fields: { name: { en: 'Pickled char' } }, sentence: 'x' })
    const change = await t.run(async (ctx) => (await ctx.db.query('changes').collect())[0]!)
    await as.owner.mutation(api.entries.undo, { site: 'restaurant', opId: opId(), change: change._id })
    const after = (await t.run((ctx) => ctx.db.get(entry)))!
    expect(after.data.name).toEqual(before.data.name)
    expect(after.prints).toEqual(before.prints)
    expect((await errorOf(as.owner.mutation(api.entries.undo, { site: 'restaurant', opId: opId(), change: change._id }))).code).toBe('NOT_UNDOABLE')
  })

  it('with locale only that language is replaced', async () => {
    const { t, as, entries } = await setup()
    const entry = entries['menu-saibling']!
    await as.owner.mutation(api.entries.save, { site: 'restaurant', opId: opId(), entry, baseRev: 1, locale: 'en', fields: { name: { de: 'IGNORED', en: 'Pickled char' } }, sentence: 'x' })
    expect((await t.run((ctx) => ctx.db.get(entry)))!.data.name).toEqual({ de: 'Gebeizter Saibling', en: 'Pickled char' })
  })
})

describe('entries.undo of structural changes', () => {
  it('a reorder change (no entry) is NOT_UNDOABLE, not NOT_FOUND', async () => {
    const { t, as, site } = await setup()
    const change = await t.run((ctx) => ctx.db.insert('changes', { site, brick: 'menu', actor: 'u-wirtin', opId: 'x', kind: 'reorder', sentence: 'Reihenfolge', contentRev: 2, at: Date.now() }))
    expect((await errorOf(as.owner.mutation(api.entries.undo, { site: 'restaurant', opId: opId(), change }))).code).toBe('NOT_UNDOABLE')
  })
})

// Break-it Phase 9 (backend): input rules of the write path.
const event = (extra: Record<string, unknown> = {}) => ({
  title: { de: 'Fest' },
  when: { from: '2026-11-01', to: '2026-11-02' },
  description: { de: 'hi' },
  ...extra,
})

/** A JPEG upload that finished processing (the sharp step runs in Node and is not part of these tests). */
async function readyImage(s: Awaited<ReturnType<typeof setup>>) {
  const id = await upload(s, { type: 'image/jpeg', content: new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0]), name: 'foto.jpg', ready: false })
  await s.t.run(async (ctx) => ctx.db.patch(id, { status: 'ready', processedId: (await ctx.db.get(id))!.storageId }))
  return id
}

describe('revisions are whole numbers from 0 (F01)', () => {
  // NaN is false in every `>` and `<`, so it used to skip the conflict check of save.
  it.each([['NaN', NaN], ['-1', -1], ['0.5', 0.5], ['Infinity', Infinity]])('save, remove, restore and reorder refuse %s', async (_name, bad) => {
    const { as, entries } = await setup()
    const entry = entries['menu-saibling']!
    const save = as.cook.mutation(api.entries.save, { site: 'restaurant', task: 'menu.price', opId: opId(), entry, baseRev: bad, fields: { price: { amount: 999 } }, sentence: 'x' })
    expect((await errorOf(save)).code).toBe('INVALID')
    expect((await errorOf(as.owner.mutation(api.entries.remove, { site: 'restaurant', opId: opId(), entry, lifeRev: bad }))).code).toBe('INVALID')
    expect((await errorOf(as.owner.mutation(api.entries.restore, { site: 'restaurant', opId: opId(), entry, lifeRev: bad }))).code).toBe('INVALID')
    const reorder = as.owner.mutation(api.entries.reorder, { site: 'restaurant', opId: opId(), brick: 'menu', order: [entry], orderRev: bad })
    expect((await errorOf(reorder)).code).toBe('INVALID')
  })

  it('a stale baseRev is still CHANGED_SINCE', async () => {
    const { as, entries } = await setup()
    const entry = entries['menu-saibling']!
    await as.owner.mutation(api.entries.save, { site: 'restaurant', opId: opId(), entry, baseRev: 1, fields: { price: { amount: 1500 } }, sentence: 'A' })
    const stale = as.cook.mutation(api.entries.save, { site: 'restaurant', task: 'menu.price', opId: opId(), entry, baseRev: 1, fields: { price: { amount: 999 } }, sentence: 'B' })
    expect((await errorOf(stale)).code).toBe('CHANGED_SINCE')
  })
})

describe('save with a locale (F02, F03)', () => {
  const note = { de: 'Alle Gerichte inklusive Beilagensalat.', en: 'All dishes include side salad.' }

  it('null with a foreign locale removes only that language of a translatable field', async () => {
    const { t, as, entries } = await setup()
    const entry = entries.lunch!
    await as.owner.mutation(api.entries.save, { site: 'restaurant', opId: opId(), entry, baseRev: 1, locale: 'en', fields: { note }, sentence: 'x' })
    await as.owner.mutation(api.entries.save, { site: 'restaurant', opId: opId(), entry, baseRev: 2, locale: 'en', fields: { note: null }, sentence: 'x' })
    expect((await t.run((ctx) => ctx.db.get(entry)))!.data.note).toEqual({ de: note.de })
  })

  it('null with the main locale (Aufheben) still removes the whole field', async () => {
    const { t, as, entries } = await setup()
    const entry = entries.lunch!
    await as.owner.mutation(api.entries.save, { site: 'restaurant', opId: opId(), entry, baseRev: 1, locale: 'en', fields: { note }, sentence: 'x' })
    await as.owner.mutation(api.entries.save, { site: 'restaurant', opId: opId(), entry, baseRev: 2, locale: 'de', fields: { note: null }, sentence: 'x' })
    expect((await t.run((ctx) => ctx.db.get(entry)))!.data.note).toBeUndefined()
  })

  it('a value without an entry for the locale is a no-op; null or "" removes that locale', async () => {
    const { t, as, entries } = await setup()
    const entry = entries['menu-saibling']!
    const before = (await t.run((ctx) => ctx.db.get(entry)))!
    const noop = await as.owner.mutation(api.entries.save, { site: 'restaurant', opId: opId(), entry, baseRev: 1, locale: 'en', fields: { name: { de: 'Anders' } }, sentence: 'x' })
    expect(noop).toMatchObject({ rev: 1, contentRev: 1 })
    expect(await t.run((ctx) => ctx.db.query('changes').collect())).toHaveLength(0)
    expect((await t.run((ctx) => ctx.db.get(entry)))!.data.name).toEqual(before.data.name)

    // "" takes the English name away, the German one stays.
    await as.owner.mutation(api.entries.save, { site: 'restaurant', opId: opId(), entry, baseRev: 1, locale: 'en', fields: { name: { en: 'Char' } }, sentence: 'x' })
    await as.owner.mutation(api.entries.save, { site: 'restaurant', opId: opId(), entry, baseRev: 2, locale: 'en', fields: { name: { en: '' } }, sentence: 'x' })
    const after = (await t.run((ctx) => ctx.db.get(entry)))!
    expect(after.data.name).toEqual({ de: 'Gebeizter Saibling' })
  })

  it('an image is saved in English without an English alt text, and the stored alt stays', async () => {
    const s = await setup()
    const file = await readyImage(s)
    const created = await s.as.owner.mutation(api.entries.create, { site: 'restaurant', opId: opId(), brick: 'events', data: event({ image: { file, alt: { de: 'Foto' } } }) }) as { entry: Id<'entries'> }
    await s.as.owner.mutation(api.entries.save, { site: 'restaurant', opId: opId(), entry: created.entry, baseRev: 1, locale: 'en', fields: { image: { file, alt: { de: 'Foto' } } }, sentence: 'x' })
    expect((await s.t.run((ctx) => ctx.db.get(created.entry)))!.data.image).toEqual({ file, alt: { de: 'Foto' } })
    await s.as.owner.mutation(api.entries.save, { site: 'restaurant', opId: opId(), entry: created.entry, baseRev: 1, locale: 'en', fields: { image: { file, alt: { de: 'Foto', en: 'Photo' } } }, sentence: 'x' })
    expect((await s.t.run((ctx) => ctx.db.get(created.entry)))!.data.image).toEqual({ file, alt: { de: 'Foto', en: 'Photo' } })
  })
})

describe('a file in an image field is an image (F04)', () => {
  it('a PDF is refused on create and save, an image upload is accepted', async () => {
    const s = await setup()
    const pdf = await upload(s, { person: 'owner' })
    const refused = await errorOf(s.as.owner.mutation(api.entries.create, { site: 'restaurant', opId: opId(), brick: 'events', data: event({ image: { file: pdf, alt: { de: 'Foto' } } }) }))
    expect(refused).toMatchObject({ code: 'INVALID', message: 'Diese Datei ist kein Bild.' })

    const created = await s.as.owner.mutation(api.entries.create, { site: 'restaurant', opId: opId(), brick: 'events', data: event() }) as { entry: Id<'entries'> }
    const save = s.as.owner.mutation(api.entries.save, { site: 'restaurant', opId: opId(), entry: created.entry, baseRev: 1, fields: { image: { file: pdf, alt: { de: 'Foto' } } }, sentence: 'x' })
    expect((await errorOf(save)).message).toBe('Diese Datei ist kein Bild.')

    const file = await readyImage(s)
    await s.as.owner.mutation(api.entries.save, { site: 'restaurant', opId: opId(), entry: created.entry, baseRev: 1, fields: { image: { file, alt: { de: 'Foto' } } }, sentence: 'x' })
  })
})

describe('sentence and opId are bounded (F07)', () => {
  const saveWith = (s: Awaited<ReturnType<typeof setup>>, over: { opId?: string; sentence?: string }) =>
    s.as.cook.mutation(api.entries.save, {
      site: 'restaurant', task: 'menu.price', entry: s.entries['menu-dal']!, baseRev: 1, fields: { price: { amount: 100 } },
      opId: over.opId ?? opId(), sentence: over.sentence ?? 'Preis',
    })

  it('a long sentence is stored cut to 200 characters; the save itself goes through', async () => {
    const s = await setup()
    // The server words the line from the entry's title, so a long title makes the long sentence (the client's is ignored).
    await s.t.run(async (ctx) => {
      const dal = (await ctx.db.get(s.entries['menu-dal']!))!
      await ctx.db.patch(dal._id, { data: { ...dal.data, name: { de: 'x'.repeat(900) } } })
    })
    await saveWith(s, { sentence: 'y'.repeat(900_000) })
    const [change] = await s.t.run((ctx) => ctx.db.query('changes').collect())
    expect(change!.sentence).toBe(`Preis von „${'x'.repeat(200 - 'Preis von „'.length - 1)}…`)
    expect(change!.msg).toMatchObject({ params: { title: 'x'.repeat(900) } })
  })

  it.each([['65 characters', 'a'.repeat(65)], ['a space', 'a b'], ['nothing', ''], ['a slash', 'a/b']])('an opId with %s is INVALID', async (_name, bad) => {
    const s = await setup()
    expect((await errorOf(saveWith(s, { opId: bad }))).code).toBe('INVALID')
    await saveWith(s, { opId: 'a'.repeat(64) })
  })
})

describe('entries.save with a ref field (SPEC 2.2)', () => {
  // Wrong behaviour caught: a ref to a deleted, foreign or other-brick entry is stored, so the page would point nowhere.
  it('refuses an ID that is not a live entry of the target brick, accepts one that is', async () => {
    const { t, as, entries } = await setup()
    const entry = entries['menu-saibling']!
    await t.run(async (ctx) => {
      const site = (await ctx.db.query('sites').collect()).find((s) => s.slug === 'restaurant')!
      const schema = structuredClone(site.schema) as any
      schema.bricks.menu.fields.side = { type: 'ref', label: 'Beilage', to: 'menu', optional: true }
      await ctx.db.patch(site._id, { schema })
    })
    const save = (side: string, baseRev = 1) => as.owner.mutation(api.entries.save, { site: 'restaurant', opId: opId(), entry, baseRev, fields: { side }, sentence: 'Beilage' })
    const otherBrick = Object.entries(entries).find(([key]) => !key.startsWith('menu-'))![1]
    for (const bad of [otherBrick, 'gone']) {
      const error = await errorOf(save(bad))
      expect(error.code).toBe('INVALID')
      expect(error.details).toMatchObject({ errors: [{ path: 'side', code: 'REF_MISSING' }] })
    }
    await expect(save(entries['menu-saibling']!)).resolves.toMatchObject({ rev: 2 })
  })

  it('a new slug that would equal a static page path gets -2', async () => {
    const { t, as, site } = await setup()
    await t.run(async (ctx) => {
      const row = (await ctx.db.get(site))!
      const schema = structuredClone(row.schema) as { pages: Record<string, Record<string, string>> }
      schema.pages.sommerfest = { de: '/veranstaltungen/sommerfest', en: '/en/events/summer-party' }
      await ctx.db.patch(site, { schema: schema as never })
    })
    const data = { title: { de: 'Sommerfest' }, when: { from: '2026-11-20', to: '2026-11-20' }, description: { de: 'Test' } }
    const { entry } = await as.owner.mutation(api.entries.create, { site: 'restaurant', opId: opId(), brick: 'events', data })
    const rows = await t.run((ctx) => ctx.db.query('slugs').withIndex('by_entry', (q) => q.eq('entry', entry)).collect())
    expect(Object.fromEntries(rows.map((r) => [r.locale, r.slug]))).toEqual({ de: 'sommerfest-2', en: 'sommerfest-2' })
  })
})
