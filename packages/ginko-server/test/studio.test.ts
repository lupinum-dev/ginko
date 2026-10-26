// Studio basics (SPEC 4.2): search, saved views, duplicate, trash, translation status and "why is this
// not public?". One test per realistic failure. The clock is fixed because event visibility depends on today.
import { isVisible, type Schema } from '@lupinum/ginko/internal'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { api } from '../convex/_generated/api'
import type { Id } from '../convex/_generated/dataModel'
import { historyText } from '../convex/lib/history'
import { errorOf, firstPage, opId, people, setup, upload } from './setup'

const NOW = Date.parse('2026-10-08T10:00:00Z')
const DAY = 24 * 60 * 60 * 1000
const site = 'restaurant'

afterEach(() => vi.useRealTimers())

/** The restaurant at a fixed time; `drafts` switches drafts on for events, `release` marks the schema as released. */
async function studioSetup(opts: { drafts?: boolean; release?: boolean } = {}) {
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
  const s = await setup()
  await s.t.run(async (ctx) => {
    const row = (await ctx.db.get(s.site))!
    const schema = row.schema as Schema
    if (opts.drafts) (schema.bricks.events as { drafts?: boolean }).drafts = true
    await ctx.db.patch(s.site, { schema, ...(opts.release ? { release: { commit: 'abc', schemaRev: 1, contentRev: 1, at: NOW } } : {}) })
  })
  const patchSchema = (change: (schema: Schema) => void) => s.t.run(async (ctx) => {
    const schema = (await ctx.db.get(s.site))!.schema as Schema
    change(schema)
    await ctx.db.patch(s.site, { schema })
  })
  const row = (id: string) => s.t.run((ctx) => ctx.db.get(id as Id<'entries'>))
  const remove = (entry: Id<'entries'>, as = s.as.owner, task?: string) =>
    as.mutation(api.entries.remove, { site, opId: opId(), entry, lifeRev: 1, ...(task ? { task } : {}) })
  const event = (title: string, extra: Record<string, unknown> = {}) => ({ title: { de: title }, when: { from: '2026-11-20', to: '2026-11-20' }, description: { de: 'Test' }, ...extra })
  const createEvent = (title: string, extra: Record<string, unknown> = {}, publish?: { at?: number }) =>
    s.as.owner.mutation(api.entries.create, { site, opId: opId(), brick: 'events', data: event(title, extra), ...(publish ? { publish } : {}) }) as Promise<{ entry: Id<'entries'> }>
  return { ...s, patchSchema, row, remove, createEvent }
}

describe('search.studio', () => {
  // Wrong behaviour caught: the palette misses a dish by a word of its name, or lists a task the person may not run.
  // Wrong behaviour caught (onboard-6): search sent staff to entries and areas they cannot open ("Diesen Bereich kannst du nicht bearbeiten").
  it('finds an entry and a task; staff only gets the tasks they hold and the areas they can open', async () => {
    const s = await studioSetup()
    const found = await s.as.owner.query(api.search.studio, { site, query: 'schnitzel' })
    // The gallery finds it too (an image description mentions the dish); the dish itself comes first.
    expect(found.entries[0]).toMatchObject({
      entry: s.entries['menu-schnitzel'], brick: 'menu', brickLabel: 'Speisekarte', label: 'Wiener Schnitzel vom Kalb', state: 'live',
    })
    expect(found.entries[0]!.snippet).toContain('Schnitzel')
    expect(found.entries.map((e) => e.brick)).toContain('gallery')
    // The cook holds menu and lunch tasks only: the gallery hit is not for him.
    expect((await s.as.cook.query(api.search.studio, { site, query: 'schnitzel' })).entries.map((e) => e.brick)).toEqual(['menu'])

    const owner = await s.as.owner.query(api.search.studio, { site, query: 'veranstaltung' })
    expect(owner.tasks).toEqual(expect.arrayContaining([expect.objectContaining({ id: 'events.add', label: 'Veranstaltung hinzufügen' })]))
    expect(owner.bricks).toEqual([expect.objectContaining({ brick: 'events', label: 'Veranstaltungen' })])
    const cook = await s.as.cook.query(api.search.studio, { site, query: 'veranstaltung' })
    expect(cook.tasks).toEqual([])
    expect(cook.bricks).toEqual([])
    const dish = await s.as.cook.query(api.search.studio, { site, query: 'gericht hinzufügen' })
    expect(dish.tasks.map((t) => t.id)).toEqual(['menu.add'])
    // An area is found by its label in any language, not only the site's main one.
    const english = await s.as.owner.query(api.search.studio, { site, query: 'events' })
    expect(english.bricks.map((b) => b.brick)).toEqual(['events'])
  })

  // Wrong behaviour caught (WS-7): "Telefon" found nothing, so the owner could not find where the phone number is; or
  // an area found by one of its fields outranks the areas named after the word.
  it('finds an area by the label of one of its fields, after the areas found by their own name', async () => {
    const s = await studioSetup()
    const areas = async (query: string) => (await s.as.owner.query(api.search.studio, { site, query })).bricks.map((b) => [b.brick, 'field' in b ? b.field : null])
    expect(await areas('telefon')).toEqual([['contact', 'phone']])
    expect(await areas('hinweis')).toEqual([['notices', null], ['lunch', 'note'], ['lunchPlans', 'note']])
  })

  // Wrong behaviour caught: a removed dish stays in the palette, or another site's entry leaks across sites.
  it('never finds a deleted entry or an entry of another site', async () => {
    const s = await studioSetup()
    await s.remove(s.entries['menu-schnitzel']!)
    expect((await s.as.owner.query(api.search.studio, { site, query: 'schnitzel' })).entries.map((e) => e.brick)).toEqual(['gallery'])

    await s.as.stranger.mutation(api.entries.create, { site: 'andere', opId: opId(), brick: 'menu', data: { category: 'mains', name: { de: 'Zwiebelrostbraten' }, price: { amount: 1800 }, allergens: [], veg: 'none' } })
    expect((await s.as.owner.query(api.search.studio, { site, query: 'zwiebelrostbraten' })).entries).toEqual([])
    expect((await s.as.stranger.query(api.search.studio, { site: 'andere', query: 'zwiebelrostbraten' })).entries).toHaveLength(1)
    expect((await errorOf(s.as.stranger.query(api.search.studio, { site, query: 'schnitzel' }))).code).toBe('FORBIDDEN')
  })

  // Wrong behaviour caught: "strudel" does not find the seeded "Topfenstrudel" (German compounds), or a mid-word match outranks a word-start one
  // (word start first, then a title match inside a word, then a match in the body).
  it('finds a word inside a compound, after the word-start matches', async () => {
    const s = await studioSetup()
    const dish = (name: string) => ({ category: 'desserts', name: { de: name }, price: { amount: 700 }, allergens: [], veg: 'none' })
    await s.as.owner.mutation(api.entries.create, { site, opId: opId(), brick: 'menu', data: dish('Strudelteig') })
    const labels = async (query: string) => (await s.as.owner.query(api.search.studio, { site, query })).entries.map((e) => e.label)
    expect(await labels('strudel')).toEqual(['Strudelteig', 'Topfenstrudel', 'Alle Gerichte inklusive Beilagensalat.'])
    expect((await labels('schni'))[0]).toBe('Wiener Schnitzel vom Kalb')
    // Another site's members never see these entries.
    expect((await errorOf(s.as.stranger.query(api.search.studio, { site, query: 'strudel' }))).code).toBe('FORBIDDEN')
    expect((await s.as.stranger.query(api.search.studio, { site: 'andere', query: 'strudel' })).entries).toEqual([])
  })

  it('marks drafts and scheduled drafts, and clamps the limit', async () => {
    const s = await studioSetup({ drafts: true })
    await s.createEvent('Wildwoche')
    await s.createEvent('Wildabend', {}, { at: NOW + DAY })
    const hits = (await s.as.owner.query(api.search.studio, { site, query: 'wild' })).entries
    expect(hits.map((h) => [h.label, h.state]).sort()).toEqual([['Wildabend', 'scheduled'], ['Wildwoche', 'draft']])
    // The limit never exceeds 50 and never falls below 1.
    expect((await s.as.owner.query(api.search.studio, { site, query: 'wild', limit: 0 })).entries).toHaveLength(1)
    expect((await s.as.owner.query(api.search.studio, { site, query: 'wild', limit: 9999 })).entries).toHaveLength(2)
  })
})

describe('views', () => {
  const view = { site, brick: 'menu', name: 'Hauptspeisen', query: { text: 'Kalb', filters: { category: 'mains' }, sort: { field: 'price', dir: 'desc' } } }

  // Wrong behaviour caught: a saved view is visible to or changeable by another person.
  it('saves, lists, changes and removes own views only', async () => {
    const s = await studioSetup()
    const { id } = await s.as.owner.mutation(api.views.save, view)
    expect(await s.as.owner.query(api.views.list, { site, brick: 'menu' })).toEqual([{ id, brick: 'menu', name: 'Hauptspeisen', query: view.query }])
    expect(await s.as.cook.query(api.views.list, { site, brick: 'menu' })).toEqual([])
    expect(await s.as.admin.query(api.views.list, { site, brick: 'menu' })).toEqual([])

    expect((await errorOf(s.as.cook.mutation(api.views.remove, { site, id }))).code).toBe('NOT_FOUND')
    expect((await errorOf(s.as.cook.mutation(api.views.save, { ...view, id, name: 'Meins' }))).code).toBe('NOT_FOUND')

    await s.as.owner.mutation(api.views.save, { ...view, id, name: 'Mains', query: { filters: { veg: 'vegan' } } })
    expect(await s.as.owner.query(api.views.list, { site, brick: 'menu' })).toEqual([{ id, brick: 'menu', name: 'Mains', query: { filters: { veg: 'vegan' } } }])
    await s.as.owner.mutation(api.views.remove, { site, id })
    expect(await s.as.owner.query(api.views.list, { site, brick: 'menu' })).toEqual([])
  })

  // Wrong behaviour caught: a view keeps a filter on a field that does not exist, and the list then silently shows nothing.
  it.each([
    ['filter on an unknown field', { ...view, query: { filters: { nope: 1 } } }],
    ['filter on a prototype key', { ...view, query: { filters: { constructor: 1 } } }],
    ['sort on an unknown field', { ...view, query: { sort: { field: 'nope', dir: 'asc' } } }],
    ['sort direction', { ...view, query: { sort: { field: 'price', dir: 'up' } } }],
    ['unknown key in the query', { ...view, query: { page: 2 } }],
    ['unknown brick', { ...view, brick: 'nope' }],
    ['a single brick', { ...view, brick: 'contact', query: {} }],
    ['empty name', { ...view, name: '   ' }],
    ['name over 60 characters', { ...view, name: 'x'.repeat(61) }],
  ])('refuses %s', async (_what, args) => {
    const s = await studioSetup()
    expect((await errorOf(s.as.owner.mutation(api.views.save, args))).code).toBe('INVALID')
    expect(await s.as.owner.query(api.views.list, { site, brick: 'menu' })).toEqual([])
  })

  it('refuses the 21st view of a brick and a name used twice', async () => {
    const s = await studioSetup()
    for (let i = 1; i <= 20; i++) await s.as.owner.mutation(api.views.save, { ...view, name: `Ansicht ${i}` })
    expect((await errorOf(s.as.owner.mutation(api.views.save, { ...view, name: 'Ansicht 21' }))).code).toBe('INVALID')
    expect(await s.as.owner.query(api.views.list, { site, brick: 'menu' })).toHaveLength(20)
    // The limit is per person: the cook still has all of his.
    await s.as.cook.mutation(api.views.save, { ...view, name: 'Ansicht 1' })
    expect((await errorOf(s.as.owner.mutation(api.views.save, { ...view, name: 'ansicht 1' }))).code).toBe('INVALID')
  })
})

describe('entries.duplicate', () => {
  // Wrong behaviour caught: the copy takes the slug of the original (SLUG_TAKEN or a second page on one URL), or shares list-row ids with it.
  it('makes a copy marked in each language (Kopie, copy), a free slug each time and its own list-row ids', async () => {
    const s = await studioSetup()
    const created = await s.createEvent('Weinabend', { description: { de: 'Sechs Weine' } })
    await s.t.run(async (ctx) => {
      const row = (await ctx.db.get(created.entry))!
      await ctx.db.patch(created.entry, { data: { ...row.data as object, title: { de: 'Weinabend', en: 'Wine evening' } } })
    })
    const first = await s.as.owner.mutation(api.entries.duplicate, { site, opId: opId(), entry: created.entry }) as { entry: Id<'entries'> }
    const second = await s.as.owner.mutation(api.entries.duplicate, { site, opId: opId(), entry: created.entry }) as { entry: Id<'entries'> }
    expect((await s.row(first.entry))!.data).toMatchObject({ title: { de: 'Weinabend (Kopie)', en: 'Wine evening (copy)' }, slug: { de: 'weinabend-kopie' }, description: { de: 'Sechs Weine' } })
    expect((await s.row(second.entry))!.data).toMatchObject({ title: { de: 'Weinabend (Kopie)' }, slug: { de: 'weinabend-kopie-2' } })
    expect((await s.row(created.entry))!.data).toMatchObject({ title: { de: 'Weinabend' }, slug: { de: 'weinabend' } })
  })

  // Wrong behaviour caught: the copy does not count its files, so the file looks unused and is swept after 7 days.
  it('counts the files of the copy', async () => {
    const s = await studioSetup()
    const file = await upload(s, { type: 'image/jpeg', content: new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0]), name: 'foto.jpg', ready: false })
    await s.t.run(async (ctx) => ctx.db.patch(file, { status: 'ready', processedId: (await ctx.db.get(file))!.storageId }))
    const created = await s.createEvent('Fest', { image: { file, alt: { de: 'Bild', en: 'Picture' } } })
    const copy = await s.as.owner.mutation(api.entries.duplicate, { site, opId: opId(), entry: created.entry }) as { entry: Id<'entries'> }
    const refs = await s.t.run((ctx) => ctx.db.query('fileRefs').withIndex('by_file', (q) => q.eq('file', file)).collect())
    expect(refs.filter((r) => r.holder === 'entry').map((r) => r.holderId).sort()).toEqual([created.entry, copy.entry].sort())
  })

  it('gives list rows new ids', async () => {
    const s = await studioSetup()
    // A brick with a list: the gallery is a single, so a collection with a list is made from the menu for this test.
    await s.patchSchema((schema) => {
      const menu = schema.bricks.menu as unknown as { fields: Record<string, unknown> }
      menu.fields.tags = { type: 'list', label: 'Zutaten', itemLabel: 'Zutat', of: { word: { type: 'text', label: 'Wort', translate: false, max: 40 } }, max: 5, optional: true }
    })
    const created = await s.as.owner.mutation(api.entries.create, {
      site, opId: opId(), brick: 'menu',
      data: { category: 'mains', name: { de: 'Gulasch' }, price: { amount: 1400 }, allergens: [], veg: 'none', tags: [{ _id: 'row0000001', word: 'Rind' }, { _id: 'row0000002', word: 'Paprika' }] },
    }) as { entry: Id<'entries'> }
    const copy = await s.as.owner.mutation(api.entries.duplicate, { site, opId: opId(), entry: created.entry }) as { entry: Id<'entries'> }
    const rows = (await s.row(copy.entry))!.data.tags as { _id: string; word: string }[]
    expect(rows.map((r) => r.word)).toEqual(['Rind', 'Paprika'])
    expect(rows.map((r) => r._id).filter((id) => id !== 'row0000001' && id !== 'row0000002')).toHaveLength(2)
    // The same opId again replays the first result and makes no second copy.
    const id = opId()
    const a = await s.as.owner.mutation(api.entries.duplicate, { site, opId: id, entry: created.entry })
    expect(await s.as.owner.mutation(api.entries.duplicate, { site, opId: id, entry: created.entry })).toEqual(a)
  })

  it('leaves a label unchanged when " (Kopie)" would not fit', async () => {
    const s = await studioSetup()
    const long = 'a'.repeat(120)
    const created = await s.as.owner.mutation(api.entries.create, { site, opId: opId(), brick: 'menu', data: { category: 'mains', name: { de: long }, price: { amount: 100 }, allergens: [], veg: 'none' } }) as { entry: Id<'entries'> }
    const copy = await s.as.owner.mutation(api.entries.duplicate, { site, opId: opId(), entry: created.entry }) as { entry: Id<'entries'> }
    expect((await s.row(copy.entry))!.data.name).toEqual({ de: long })
  })

  // Wrong behaviour caught: the copy of a draft goes live at once, or the copy of a live entry in a drafts brick is public without review.
  it('is a draft in a drafts brick, also when the original is live', async () => {
    const s = await studioSetup({ drafts: true })
    const live = await s.createEvent('Fest', {}, {}) as { entry: Id<'entries'> }
    expect((await s.row(live.entry))!.state).toBeUndefined()
    const copy = await s.as.owner.mutation(api.entries.duplicate, { site, opId: opId(), entry: live.entry }) as { entry: Id<'entries'>; state: string }
    expect(copy.state).toBe('draft')
    expect((await s.row(copy.entry))!.state).toBe('draft')
  })

  // Wrong behaviour caught: flagged staff duplicates around the approval, or staff without a create task duplicates at all.
  it('becomes a proposal for flagged staff and needs a create task', async () => {
    const s = await studioSetup()
    await s.patchSchema((schema) => { for (const task of schema.bricks.menu!.tasks ?? []) (task as { needsApproval?: boolean }).needsApproval = true })
    const count = () => s.t.run(async (ctx) => (await ctx.db.query('entries').collect()).length)
    const before = await count()
    const result = await s.as.cook.mutation(api.entries.duplicate, { site, opId: opId(), task: 'menu.add', entry: s.entries['menu-saibling']! })
    expect(result).toMatchObject({ status: 'open' })
    expect(await count()).toBe(before)
    const proposals = await s.t.run((ctx) => ctx.db.query('proposals').collect())
    expect(proposals).toEqual([expect.objectContaining({ op: 'create', brick: 'menu', author: people.cook, sentence: '„Gebeizter Saibling (Kopie)“ anlegen' })])

    expect((await errorOf(s.as.cook.mutation(api.entries.duplicate, { site, opId: opId(), task: 'menu.remove', entry: s.entries['menu-saibling']! }))).code).toBe('FORBIDDEN')
    expect((await errorOf(s.as.cook.mutation(api.entries.duplicate, { site, opId: opId(), entry: s.entries['menu-saibling']! }))).code).toBe('FORBIDDEN')
    // A single brick and a removed entry have no copy.
    expect((await errorOf(s.as.owner.mutation(api.entries.duplicate, { site, opId: opId(), entry: s.entries.contact! }))).code).toBe('INVALID')
    await s.remove(s.entries['menu-frittaten']!)
    expect((await errorOf(s.as.owner.mutation(api.entries.duplicate, { site, opId: opId(), entry: s.entries['menu-frittaten']! }))).code).toBe('INVALID')
  })
})

describe('entries.trash', () => {
  // Wrong behaviour caught: the trash shows a live entry, hides who removed it, or promises a purge date other than retention's.
  it('lists a removed entry with purgeAt and who removed it, and no live one', async () => {
    const s = await studioSetup()
    await s.remove(s.entries['menu-frittaten']!)
    const trash = await s.as.owner.query(api.entries.trash, { site, paginationOpts: firstPage })
    expect(trash.isDone).toBe(true)
    expect(trash.page).toEqual([expect.objectContaining({
      entry: s.entries['menu-frittaten'], brick: 'menu', brickLabel: 'Speisekarte', label: 'Frittatensuppe', lifeRev: 2,
      deletedAt: NOW, purgeAt: NOW + 30 * DAY, deletedBy: { actor: people.owner, email: 'wirtin@example.com' }, mayRestore: true,
    })])
    expect((await s.as.owner.query(api.entries.trash, { site, brick: 'events', paginationOpts: firstPage })).page).toEqual([])
    expect((await errorOf(s.as.owner.query(api.entries.trash, { site, brick: 'contact', paginationOpts: firstPage }))).code).toBe('INVALID')
    expect((await errorOf(s.as.stranger.query(api.entries.trash, { site, paginationOpts: firstPage }))).code).toBe('FORBIDDEN')
  })

  it('brick narrows the list; the site says it has a trash while something is removed', async () => {
    const s = await studioSetup()
    const hasTrash = async () => (await s.as.owner.query(api.sites.meta, { site })).site.hasTrash
    expect(await hasTrash()).toBe(false)
    await s.remove(s.entries['menu-frittaten']!)
    await s.remove((await s.createEvent('Wildwoche')).entry)
    const narrowed = await s.as.owner.query(api.entries.trash, { site, brick: 'menu', paginationOpts: firstPage })
    expect(narrowed.page.map((item) => item.label)).toEqual(['Frittatensuppe'])
    expect(await hasTrash()).toBe(true)
  })

  // Wrong behaviour caught: a page reads every big removed entry and its saved versions at once and passes Convex's
  // 16 MiB read limit, so the trash does not load and cannot be emptied.
  it('pages big removed entries by bytes, and each row still names who removed it', async () => {
    const s = await studioSetup()
    const big = 'x'.repeat(470 * 1024)
    await s.t.run(async (ctx) => {
      for (let i = 0; i < 7; i++) {
        const entry = await ctx.db.insert('entries', {
          site: s.site, brick: 'menu', kind: 'item', order: 100 + i, data: { name: { de: `Groß ${i}` }, note: big }, rev: 4, fieldRevs: {}, lifeRev: 2, prints: {}, bytes: big.length, deletedAt: NOW - i,
        })
        const change = { site: s.site, entry, brick: 'menu', actor: people.owner, opId: opId(), sentence: '', contentRev: 1 }
        for (let save = 0; save < 3; save++) await ctx.db.insert('changes', { ...change, kind: 'save', fields: ['note'], before: { note: big }, after: { note: `${big}${save}` }, at: NOW - 10_000 + save })
        await ctx.db.insert('changes', { ...change, kind: 'remove', at: NOW - i })
      }
    })
    const pages = []
    let cursor: string | null = null
    for (;;) {
      const page: { page: { label: string; deletedBy: unknown }[]; isDone: boolean; continueCursor: string } = await s.as.owner.query(api.entries.trash, { site, paginationOpts: { numItems: 50, cursor } })
      pages.push(page.page.map((item) => item.label))
      expect(page.page.every((item) => (item.deletedBy as { actor?: string } | null)?.actor === people.owner)).toBe(true)
      if (page.isDone) break
      cursor = page.continueCursor
    }
    expect(pages).toEqual([['Groß 0', 'Groß 1', 'Groß 2', 'Groß 3', 'Groß 4'], ['Groß 5', 'Groß 6']])
  })

  it('pages newest first', async () => {
    const s = await studioSetup()
    const ids = ['menu-saibling', 'menu-frittaten', 'menu-schnitzel'] as const
    for (const id of ids) {
      vi.setSystemTime(Date.now() + 1000)
      await s.remove(s.entries[id]!)
    }
    const all = (await s.as.owner.query(api.entries.trash, { site, paginationOpts: firstPage })).page.map((i) => i.entry)
    expect(all).toEqual([...ids].reverse().map((id) => s.entries[id]))
  })

  // Wrong behaviour caught: staff restores around a missing right or around the approval flag, or the UI offers a restore that fails.
  it('restore keeps the staff rights and the policy', async () => {
    const s = await studioSetup()
    const entry = s.entries['menu-frittaten']!
    await s.remove(entry)
    const restore = (as = s.as.cook, task: string | undefined = 'menu.remove') => as.mutation(api.entries.restore, { site, opId: opId(), entry, lifeRev: 2, ...(task ? { task } : {}) })

    expect((await s.as.cook.query(api.entries.trash, { site, paginationOpts: firstPage })).page[0]).toMatchObject({ mayRestore: true, task: 'menu.remove' })
    // Without the remove grant the cook neither sees "restore" nor may restore.
    await s.t.run(async (ctx) => {
      const member = (await ctx.db.query('memberships').withIndex('by_user_site', (q) => q.eq('user', people.cook).eq('site', s.site)).unique())!
      await ctx.db.patch(member._id, { grants: member.grants.filter((g) => g !== 'menu.remove') })
    })
    expect((await s.as.cook.query(api.entries.trash, { site, paginationOpts: firstPage })).page[0]).toMatchObject({ mayRestore: false })
    expect((await errorOf(restore())).code).toBe('FORBIDDEN')
    await s.t.run(async (ctx) => {
      const member = (await ctx.db.query('memberships').withIndex('by_user_site', (q) => q.eq('user', people.cook).eq('site', s.site)).unique())!
      await ctx.db.patch(member._id, { grants: [...member.grants, 'menu.remove'] })
    })
    // With the flag the cook must propose instead.
    await s.patchSchema((schema) => { for (const task of schema.bricks.menu!.tasks ?? []) (task as { needsApproval?: boolean }).needsApproval = true })
    expect((await s.as.cook.query(api.entries.trash, { site, paginationOpts: firstPage })).page[0]).toMatchObject({ mayRestore: false })
    expect((await errorOf(restore())).code).toBe('FORBIDDEN')
    // The owner restores, and the trash is empty.
    await restore(s.as.owner, undefined)
    expect((await s.as.owner.query(api.entries.trash, { site, paginationOpts: firstPage })).page).toEqual([])
  })
})

describe('sites.translationStatus', () => {
  // Wrong behaviour caught: the status counts a text as translated that the bundle still serves in German (or the reverse).
  it('counts missing and outdated English texts the way the bundle does', async () => {
    const s = await studioSetup()
    // The English bundle then keeps the German-only events too, so every entry has a fallback list to compare with.
    await s.patchSchema((schema) => { (schema.bricks.events as { untranslated?: string }).untranslated = 'fallback' })
    const status = await s.as.owner.query(api.sites.translationStatus, { site })
    expect(status).toMatchObject({ main: 'de', locales: ['en'] })
    const menu = status.bricks.find((b) => b.brick === 'menu')!.locales.en!
    expect(menu.missing + menu.outdated + menu.ok).toBe(8)
    // "Frittatensuppe" has no English name; the print of the schnitzel's English name no longer fits the German one.
    const english = async (key: string) => (await s.as.owner.query(api.entries.get, { site, entry: s.entries[key]! }))!.translation.en
    expect(await english('menu-frittaten')).toEqual({ missing: ['description', 'name'], outdated: [], blocking: ['name'], page: 'shown' })
    expect((await english('menu-schnitzel'))!.outdated).toEqual(expect.arrayContaining(['name']))

    // The bundle's fallback lists of English give the same entries and numbers as the missing texts of the list rows and
    // the status. An outdated translation stays on the website (D6), so it is no fallback, but the Studio still counts it.
    const bundle = (await (await s.t.fetch('/bundle/restaurant?format=3&locale=en')).json()) as { bricks: Record<string, { items?: { id: string; data: Record<string, unknown>; fallback: string[] }[] }> }
    const schema = (await s.t.run((ctx) => ctx.db.get(s.site)))!.schema as Schema
    for (const brick of status.bricks.filter((b) => b.kind === 'collection')) {
      const withFallback = (bundle.bricks[brick.brick]!.items ?? []).filter((item) => item.fallback.length)
      const rows = (await s.as.owner.query(api.entries.list, { site, brick: brick.brick, limit: 2000 })).rows
      const missing = new Map(rows.map((row) => [row._id as string, row.gaps.reduce((sum, g) => sum + g.missing, 0)]))
      expect([...missing].filter(([, count]) => count).map(([id]) => id).sort(), brick.brick).toEqual(withFallback.map((i) => i.id).sort())
      for (const item of withFallback) expect(missing.get(item.id), `${brick.brick} ${item.id}`).toBe(item.fallback.length)
      // The status counts what the site shows: the bundle still holds a past event, its listings leave it out.
      const shown = withFallback.filter((item) => isVisible(schema.bricks[brick.brick]!, item.data, '2026-10-08'))
      expect(brick.locales.en!.missing, brick.brick).toBe(shown.length)
    }
    expect(menu.outdated).toBeGreaterThan(0)
  })

  // Wrong behaviour caught (overview): the list of open translations misses a page that is not online in English
  // because of them, or lists a draft that is not on the website yet (admin-4, A11), or a past event the site no
  // longer shows in any language, so weekly events pile up as open translations.
  it('leaves out removed entries, drafts and past events, and lists the entries with a gap', async () => {
    const s = await studioSetup({ drafts: true })
    const base = (await s.as.owner.query(api.sites.translationStatus, { site })).bricks.find((b) => b.brick === 'events')!.locales.en!
    const draft = await s.createEvent('Entwurf ohne Übersetzung')
    const live = await s.createEvent('Wildwoche', {}, {})
    await s.remove(s.entries.martinigans!)
    const status = await s.as.owner.query(api.sites.translationStatus, { site })
    const after = status.bricks.find((b) => b.brick === 'events')!.locales.en!
    // One live entry more, one removed.
    expect(after.missing + after.outdated + after.ok).toBe(base.missing + base.outdated + base.ok)
    expect(status.entries).toContainEqual({ brick: 'events', entry: live.entry, title: 'Wildwoche', locale: 'en', missing: 2, outdated: 0, hidden: true })
    expect(status.entries.map((e) => e.entry)).not.toContain(draft.entry)
    expect(status.entries.map((e) => e.entry)).not.toContain(s.entries.martinigans)
    // The summer festival (June, German only) is over.
    expect(status.entries.map((e) => e.entry)).not.toContain(s.entries.sommerfest)
    expect(status.truncated).toBe(false)
  })

  // Wrong behaviour caught: the list for staff is cut at 200 rows before their own areas come, so it says
  // "Alles übersetzt." while the menu says "N offen".
  it('gives staff the areas of their tasks only, in the list and in the counts', async () => {
    const s = await studioSetup()
    const status = await s.as.cook.query(api.sites.translationStatus, { site })
    expect(status.bricks.map((b) => b.brick).sort()).toEqual(['lunch', 'menu'])
    expect([...new Set(status.entries.map((e) => e.brick))].sort()).toEqual(['lunch', 'menu'])
    const owner = await s.as.owner.query(api.sites.translationStatus, { site })
    expect(owner.bricks.map((b) => b.brick)).toEqual(expect.arrayContaining(['menu', 'lunch', 'events', 'hours']))
  })
})

describe('the answer of a save says what the other languages show', () => {
  // Wrong behaviour caught: the message after saving claims a German fallback for a page that is missing in English,
  // or says nothing about the German text a new FAQ question or an outdated translation shows there (romi-4, P5).
  it('a hidden page, a new text shown in the main language, an outdated translation, and nothing for a date', async () => {
    const s = await studioSetup()
    const created = await s.createEvent('Wildwoche') as { entry: Id<'entries'>; translation: unknown }
    expect(created.translation).toEqual([{ locale: 'en', page: 'hidden', missing: 2, outdated: 0 }])
    const save = (entry: Id<'entries'>, fields: Record<string, unknown>, baseRev = 1) =>
      s.as.owner.mutation(api.entries.save, { site, opId: opId(), entry, baseRev, locale: 'de', fields }) as Promise<{ translation: unknown }>
    expect((await save(created.entry, { title: { de: 'Wildwochen' } })).translation).toEqual([{ locale: 'en', page: 'hidden', missing: 1, outdated: 0 }])
    expect((await save(created.entry, { when: { from: '2026-11-21', to: '2026-11-21' } }, 2)).translation).toEqual([])

    const dish = await s.as.owner.mutation(api.entries.create, { site, opId: opId(), brick: 'menu', data: { category: 'mains', name: { de: 'Kürbisgulasch' }, price: { amount: 1490 }, allergens: [], veg: 'vegan' } }) as { translation: unknown }
    expect(dish.translation).toEqual([{ locale: 'en', page: 'shown', missing: 1, outdated: 0 }])
    expect((await save(s.entries['menu-saibling']!, { name: { de: 'Gebeizter Bachsaibling' } })).translation).toEqual([{ locale: 'en', page: 'shown', missing: 0, outdated: 1 }])
  })

  // Wrong behaviour caught: a German-only draft goes online through "Veröffentlichen" and the message does not say
  // that its page is missing on the English site (romi-4, reached through publishing).
  it('publishing a draft now says it too; a scheduled publish says nothing yet', async () => {
    const s = await studioSetup({ drafts: true })
    const publish = (entry: Id<'entries'>, at?: number) =>
      s.as.owner.mutation(api.entries.publish, { site, opId: opId(), entry, lifeRev: 1, ...(at ? { at } : {}) }) as Promise<{ translation: unknown }>
    const now = await s.createEvent('Wildwoche')
    expect((await publish(now.entry)).translation).toEqual([{ locale: 'en', page: 'hidden', missing: 2, outdated: 0 }])
    const later = await s.createEvent('Rehwoche')
    expect((await publish(later.entry, NOW + DAY)).translation).toEqual([])
  })

  // Wrong behaviour caught: a save in English also reports the French page, which that save did not touch.
  it('a save in another language names only that language', async () => {
    const s = await studioSetup()
    await s.patchSchema((schema) => { schema.locales.push('fr') })
    const save = (locale: string, fields: Record<string, unknown>, baseRev: number) =>
      s.as.owner.mutation(api.entries.save, { site, opId: opId(), entry: s.entries['menu-frittaten']!, baseRev, locale, fields }) as Promise<{ translation: unknown }>
    expect((await save('en', { name: { en: 'Pancake soup' } }, 1)).translation).toEqual([])
    expect((await save('de', { name: { de: 'Frittatensuppe vom Rind' } }, 2)).translation).toEqual([
      { locale: 'en', page: 'shown', missing: 0, outdated: 1 }, { locale: 'fr', page: 'shown', missing: 1, outdated: 0 },
    ])
  })
})

describe('the address of a page in another language', () => {
  // Wrong behaviour caught: an entry made in German keeps its German address in English for good, or a later English
  // title edit moves an English page that is already online and breaks its links (romi-12, media-14).
  it('comes from the translated title until the page is online there, then stays', async () => {
    const s = await studioSetup()
    const saveEnglish = (entry: Id<'entries'>, baseRev: number, fields: Record<string, unknown>) =>
      s.as.owner.mutation(api.entries.save, { site, opId: opId(), entry, baseRev, locale: 'en', fields })
    const slugRows = (entry: Id<'entries'>) => s.t.run(async (ctx) =>
      (await ctx.db.query('slugs').withIndex('by_entry', (q) => q.eq('entry', entry)).collect()).map((r) => `${r.locale}:${r.slug}`).sort())
    const slugOf = async (entry: Id<'entries'>) => (await s.row(entry))!.data.slug

    const wild = await s.createEvent('Wildwoche')
    expect(await slugOf(wild.entry)).toEqual({ de: 'wildwoche', en: 'wildwoche' })
    await saveEnglish(wild.entry, 1, { title: { en: 'Game week' } })
    expect(await slugOf(wild.entry)).toEqual({ de: 'wildwoche', en: 'game-week' })
    expect(await slugRows(wild.entry)).toEqual(['de:wildwoche', 'en:game-week'])

    // The same English title on another entry takes the next free address.
    const deer = await s.createEvent('Rehwoche')
    await saveEnglish(deer.entry, 1, { title: { en: 'Game week' } })
    expect(await slugOf(deer.entry)).toEqual({ de: 'rehwoche', en: 'game-week-2' })

    // With its description the page is online in English: a new English title keeps the address.
    await saveEnglish(wild.entry, 2, { description: { en: 'Venison all week' } })
    await saveEnglish(wild.entry, 3, { title: { en: 'Game weeks' } })
    expect(await slugOf(wild.entry)).toEqual({ de: 'wildwoche', en: 'game-week' })
    expect(await slugRows(wild.entry)).toEqual(['de:wildwoche', 'en:game-week'])

    // A language without pages of this kind has no address to make.
    await s.patchSchema((schema) => { delete (schema.bricks.events as { route: Record<string, string> }).route.en })
    const hare = await s.createEvent('Hasenwoche')
    await saveEnglish(hare.entry, 1, { title: { en: 'Hare week' } })
    expect(await slugOf(hare.entry)).toEqual({ de: 'hasenwoche', en: 'hasenwoche' })
  })
})

describe('the address of a page in another language, with drafts', () => {
  // Wrong behaviour caught: the English address made from a title saved as an unpublished change is lost, or moves
  // online before the change is published.
  it('waits with the saved title and moves when the changes are published', async () => {
    const s = await studioSetup({ drafts: true })
    const slugRows = (entry: Id<'entries'>) => s.t.run(async (ctx) =>
      (await ctx.db.query('slugs').withIndex('by_entry', (q) => q.eq('entry', entry)).collect()).map((r) => `${r.locale}:${r.slug}`).sort())
    const wild = await s.createEvent('Wildwoche')
    await s.as.owner.mutation(api.entries.publish, { site, opId: opId(), entry: wild.entry, lifeRev: 1 })
    const rev = (await s.row(wild.entry))!.rev
    await s.as.owner.mutation(api.entries.save, { site, opId: opId(), entry: wild.entry, baseRev: rev, locale: 'en', fields: { title: { en: 'Game week' } } })
    expect(await slugRows(wild.entry)).toEqual(['de:wildwoche', 'en:wildwoche'])
    expect((await s.as.owner.query(api.entries.get, { site, entry: wild.entry }))!.data.slug).toEqual({ de: 'wildwoche', en: 'game-week' })
    await s.as.owner.mutation(api.entries.publish, { site, opId: opId(), entry: wild.entry, lifeRev: 2 })
    expect(await slugRows(wild.entry)).toEqual(['de:wildwoche', 'en:game-week'])
    expect((await s.row(wild.entry))!.data.slug).toEqual({ de: 'wildwoche', en: 'game-week' })
  })
})

describe('entries.whyNotPublic', () => {
  const codes = (result: { reasons: { code: string }[] }) => result.reasons.map((r) => r.code)
  const why = (s: Awaited<ReturnType<typeof studioSetup>>, entry: string, locale?: string) =>
    s.as.owner.query(api.entries.whyNotPublic, { site, entry, ...(locale ? { locale } : {}) })

  it('a draft', async () => {
    const s = await studioSetup({ drafts: true, release: true })
    const draft = await s.createEvent('Wildwoche')
    const result = await why(s, draft.entry)
    expect(codes(result)).toEqual(['draft'])
    expect(result).toMatchObject({ public: false, reasons: [{ blocking: true, action: 'publish', sentence: expect.stringContaining('Entwurf') }] })
    expect(result.url).toBeUndefined()
  })

  it('a scheduled draft, with the time in the time zone of the site', async () => {
    const s = await studioSetup({ drafts: true, release: true })
    // 2026-10-09 10:00 UTC is 12:00 in Vienna (summer time).
    const scheduled = await s.createEvent('Wildwoche', {}, { at: NOW + DAY })
    const result = await why(s, scheduled.entry)
    expect(codes(result)).toEqual(['scheduled'])
    expect(result.reasons[0]!.sentence).toContain('9. Okt., 12:00 Uhr')
    expect(result.reasons[0]!.sentence).toContain('Europe/Vienna')
    // The reason is a message too: the Studio shows it in the reader's language, with the date in the site's zone.
    expect(result.reasons[0]!.msg).toEqual({ key: 'publicness.scheduled', params: { at: NOW + DAY, zone: 'Europe/Vienna' } })
    expect(historyText(result.reasons[0]!.msg, 'en', { locales: ['de'], timeZone: 'Europe/Vienna' })).toBe('The entry is a draft and goes online on Oct 9, 12:00 (time zone Europe/Vienna).')
  })

  it('a removed entry, with the date it is deleted for good', async () => {
    const s = await studioSetup({ release: true })
    await s.remove(s.entries.weinabend!)
    const result = await why(s, s.entries.weinabend!)
    expect(codes(result)).toEqual(['deleted'])
    expect(result.reasons[0]).toMatchObject({ action: 'restore', sentence: expect.stringContaining('7. November 2026') })
  })

  it('a missing translation: hidden by default on a page, listed with the German page under opt-in fallback', async () => {
    const s = await studioSetup({ release: true })
    const hidden = await why(s, s.entries.martinigans!, 'en')
    expect(codes(hidden)).toEqual(['translation_hidden'])
    expect(hidden).toMatchObject({ public: false })
    expect(hidden.url).toBeUndefined()

    await s.patchSchema((schema) => { (schema.bricks.events as { untranslated?: string }).untranslated = 'fallback' })
    const fallback = await why(s, s.entries.martinigans!, 'en')
    expect(codes(fallback)).toEqual(['translation_fallback'])
    expect(fallback).toMatchObject({ public: true, reasons: [{ blocking: false, action: 'translate', msg: { key: 'publicness.translationFallbackMainPage' }, sentence: expect.stringContaining('verlinkt auf seine Seite in der Hauptsprache') }] })
    expect(fallback.url).toBeUndefined()
    // In the main language the entry is fine.
    expect(codes(await why(s, s.entries.martinigans!))).toEqual([])
  })

  // Wrong behaviour caught: "Für en sind veraltet Übersetzungen.": a language code instead of its name, and broken German.
  it('an outdated translation names the language and says the website keeps it', async () => {
    const s = await studioSetup({ release: true })
    await s.as.owner.mutation(api.entries.save, { site, opId: opId(), entry: s.entries['menu-marillen']!, baseRev: 1, locale: 'de', fields: { name: { de: 'Marillenknödel mit Butterbrösel' } } })
    const result = await why(s, s.entries['menu-marillen']!, 'en')
    expect(codes(result)).toEqual(['no_route', 'translation_fallback'])
    const reason = result.reasons[1]!
    expect(reason.sentence).toBe('Für Englisch sind Übersetzungen veraltet. Die Website zeigt dort noch die ältere Übersetzung.')
    expect(historyText(reason.msg, 'en', { locales: ['de', 'en'], timeZone: 'Europe/Vienna' })).toBe('For English, translations are outdated. The website still shows the older translation there.')
  })

  it('a brick without a route', async () => {
    const s = await studioSetup({ release: true })
    const result = await why(s, s.entries['menu-saibling']!)
    expect(codes(result)).toEqual(['no_route'])
    expect(result).toMatchObject({ public: true, reasons: [{ blocking: false, sentence: expect.stringContaining('nur innerhalb anderer Seiten') }] })
    expect(result.url).toBeUndefined()
  })

  it('a schema that was never released', async () => {
    const s = await studioSetup()
    const result = await why(s, s.entries.martinigans!)
    expect(codes(result)).toEqual(['not_released'])
    expect(result).toMatchObject({ public: false, reasons: [{ action: 'release' }] })
  })

  it('a public routed entry has no reasons and its url', async () => {
    const s = await studioSetup({ release: true })
    expect(await why(s, s.entries.martinigans!)).toMatchObject({ locale: 'de', public: true, reasons: [], path: '/veranstaltungen/martini-gansl', url: 'https://ginko-demo-restaurant.vercel.app/veranstaltungen/martini-gansl' })
    expect((await errorOf(why(s, s.entries.martinigans!, 'fr'))).code).toBe('INVALID')
    expect((await errorOf(s.as.stranger.query(api.entries.whyNotPublic, { site: 'andere', entry: s.entries.martinigans! }))).code).toBe('NOT_FOUND')
  })
})

describe('Studio reads at volume', () => {
  // Wrong behaviour caught: Schnell ändern subscribes to whole entries (long texts, images) of a timed collection, so a
  // collection near the site budget resends megabytes on every change.
  it('slim rows carry only the titles and dates of collection entries; singles stay whole', async () => {
    const s = await studioSetup()
    const rows = await s.as.owner.query(api.entries.ofBricks, { site, bricks: ['events', 'contact', 'menu'], slim: true })
    const weinabend = rows.find((row) => row._id === s.entries.weinabend)!
    expect(Object.keys(weinabend.data).sort()).toEqual(['booking', 'price', 'title', 'when'])
    // A sold-out event keeps the flag: Today marks its row "Ausgebucht".
    const { entry: soldOut } = await s.createEvent('Ausverkauft', { soldOut: true })
    const after = await s.as.owner.query(api.entries.ofBricks, { site, bricks: ['events'], slim: true })
    expect(after.find((row) => row._id === soldOut)!.data.soldOut).toBe(true)
    // The pick list of "Preis ändern" reads slim rows too (volume-11): it groups by the choice and shows the price,
    // the planned one from its date on.
    expect(Object.keys(rows.find((row) => row._id === s.entries['menu-schnitzel'])!.data).sort()).toEqual(['category', 'description', 'name', 'nextPrice', 'price', 'priceFrom', 'veg'])
    expect(weinabend.prints).toEqual({})
    expect(Object.keys(rows.find((row) => row.brick === 'contact')!.data).sort()).toEqual(['city', 'email', 'phone', 'postalCode', 'street'])
  })

  /** `count` notices without English ("Hinweis 0" …) inserted straight into the brick, as an imported site holds them. */
  async function manyNotices(s: Awaited<ReturnType<typeof studioSetup>>, count: number) {
    await s.t.run(async (ctx) => {
      for (let i = 0; i < count; i++) {
        await ctx.db.insert('entries', { site: s.site, brick: 'notices', kind: 'item', order: 100 + i, data: { text: { de: `Hinweis ${i}` }, until: '2026-12-31' }, rev: 1, fieldRevs: {}, lifeRev: 1, prints: {}, bytes: 60 })
      }
    })
  }

  // Wrong behaviour caught: every Studio page subscribes to the site with all its entries, so each save anywhere sends
  // the whole site (megabytes) to every open tab.
  it('sites.meta carries no entries: it stays the same size when the site gets 120 more', async () => {
    const s = await studioSetup()
    const before = await s.as.owner.query(api.sites.meta, { site })
    await manyNotices(s, 120)
    expect(await s.as.owner.query(api.sites.meta, { site })).toEqual(before)
  })

  // Wrong behaviour caught: the list renders and searches every entry in the browser (1,000 rows, 5 MB).
  it('entries.list sends 50 small rows of a long list and searches on the server', async () => {
    const s = await studioSetup()
    const base = await s.as.owner.query(api.entries.list, { site, brick: 'notices' })
    await manyNotices(s, 120)
    const list = await s.as.owner.query(api.entries.list, { site, brick: 'notices' })
    expect(list.rows).toHaveLength(50)
    expect(list.total).toBe(base.total + 120)
    expect(JSON.stringify(list.rows).length).toBeLessThan(50 * 300)
    const found = await s.as.owner.query(api.entries.list, { site, brick: 'notices', search: 'hinweis 107' })
    expect(found.rows.map((r) => r.title)).toEqual(['Hinweis 107'])
  })

  // Wrong behaviour caught: a ref field that points at a retired collection shows no titles for the ids it holds.
  it('entries.titles still names the entries of a retired collection', async () => {
    const s = await studioSetup()
    await manyNotices(s, 1)
    await s.t.run(async (ctx) => {
      const row = (await ctx.db.get(s.site))!
      const schema = structuredClone(row.schema)
      schema.bricks.notices.retired = true
      await ctx.db.patch(s.site, { schema })
    })
    const titles = await s.as.owner.query(api.entries.titles, { site, brick: 'notices' })
    expect(titles.map((e) => e.title)).toContain('Hinweis 0')
  })

  // Wrong behaviour caught: the translation badges came from a status list capped at 200 entries, so every later
  // entry showed as translated.
  it('the 201st notice of a brick still shows its missing English text', async () => {
    const s = await studioSetup()
    await manyNotices(s, 201)
    const list = await s.as.owner.query(api.entries.list, { site, brick: 'notices', search: 'hinweis 200' })
    expect(list.rows[0]!.gaps).toEqual([{ locale: 'en', missing: 1, outdated: 0 }])
  })
})
