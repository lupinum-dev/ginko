// The asset library backend (SPEC 3, 4.3, 12): rights, folders, views, usage, trash, replace and the
// retention of trash and replaced files. One test per realistic failure.
import { describe, expect, it, vi } from 'vitest'
import { api, internal } from '../convex/_generated/api'
import type { Schema } from '@lupinum/ginko/internal'
import type { Id } from '../convex/_generated/dataModel'
import { CORPUS_NOW } from './clock'
import { errorOf, opId, postUpload, setup, upload } from './setup'

type Setup = Awaited<ReturnType<typeof setup>>

const DAY = 24 * 60 * 60 * 1000
const site = 'restaurant'
type Bundle = { bricks: Record<string, { items?: { id: string; data: Record<string, unknown> }[] }> }

/** A JPEG upload that finished processing (the sharp step runs in Node and is not part of these tests). */
async function readyImage(s: Setup, name = 'foto.jpg', bytes = [0xff, 0xd8, 0xff, 0xe0, 0, 0]) {
  const id = await upload(s, { type: 'image/jpeg', content: new Uint8Array(bytes), name, ready: false })
  await s.t.run(async (ctx) => ctx.db.patch(id, { status: 'ready', processedId: (await ctx.db.get(id))!.storageId }))
  return id
}

const pdf = (s: Setup, name = 'karte.pdf', content = '%PDF-1.4 karte') => upload(s, { content, name })

/** An event whose image is `file` with the given alt text. */
async function useImage(s: Setup, file: Id<'uploads'>, alt: Record<string, string>) {
  const created = await s.as.owner.mutation(api.entries.create, {
    site, opId: opId(), brick: 'events',
    // Translated, so the English bundle has the entry (an untranslated event has no English page).
    data: { title: { de: 'Weinabend', en: 'Wine evening' }, when: { from: '2026-11-01', to: '2026-11-02' }, description: { de: 'hi', en: 'hi' }, image: { file, alt } },
  }) as { entry: Id<'entries'> }
  return created.entry
}

const fileRefsOf = async (s: Setup, file: Id<'uploads'>) => (await allRefsOf(s, file)).filter((r) => r.holder === 'entry')
const allRefsOf = (s: Setup, file: Id<'uploads'>) =>
  s.t.run((ctx) => ctx.db.query('fileRefs').withIndex('by_file', (q) => q.eq('file', file)).collect())

describe('rights', () => {
  it.each([
    ['createFolder', (c: Setup['as']['owner'], _f: string) => c.mutation(api.files.createFolder, { site, name: crypto.randomUUID().slice(0, 8) })],
    ['move', (c: Setup['as']['owner'], f: string) => c.mutation(api.files.move, { site, files: [f], folder: null })],
    ['rename', (c: Setup['as']['owner'], f: string) => c.mutation(api.files.rename, { site, file: f, name: 'neu.pdf' })],
    ['keep', (c: Setup['as']['owner'], f: string) => c.mutation(api.files.keep, { site, files: [f] })],
    ['trash', (c: Setup['as']['owner'], f: string) => c.mutation(api.files.trash, { site, files: [f] })],
    ['restore', (c: Setup['as']['owner'], f: string) => c.mutation(api.files.restore, { site, files: [f] })],
  ])('%s: owner and admin may, staff gets FORBIDDEN', async (_name, call) => {
    const s = await setup()
    const file = await pdf(s)
    expect((await errorOf(call(s.as.cook, file))).code).toBe('FORBIDDEN')
    await call(s.as.owner, file)
    await call(s.as.admin, file)
  })

  it('every member reads the library and uploads; a stranger gets FORBIDDEN', async () => {
    const s = await setup()
    const file = await pdf(s)
    expect((await s.as.cook.query(api.files.list, { site, view: 'all' })).files).toHaveLength(1)
    expect((await s.as.cook.query(api.files.info, { site, file })).name).toBe('karte.pdf')
    expect(await s.as.cook.query(api.files.folders, { site })).toEqual([])
    await s.as.cook.mutation(api.uploads.prepare, { site, library: true })
    expect((await errorOf(s.as.stranger.query(api.files.list, { site, view: 'all' }))).code).toBe('FORBIDDEN')
  })

  it('a file id of another site is NOT_FOUND everywhere, never a hint that it exists', async () => {
    const s = await setup()
    const mine = await pdf(s)
    const stranger = s.as.stranger
    const calls = [
      stranger.query(api.files.info, { site: 'andere', file: mine }),
      stranger.mutation(api.files.rename, { site: 'andere', file: mine, name: 'x.pdf' }),
      stranger.mutation(api.files.trash, { site: 'andere', files: [mine] }),
      stranger.mutation(api.files.move, { site: 'andere', files: [mine], folder: null }),
    ]
    for (const call of calls) expect((await errorOf(call)).code).toBe('NOT_FOUND')
    const unknown = await errorOf(stranger.query(api.files.info, { site: 'andere', file: 'kein-id' }))
    expect(unknown.code).toBe('NOT_FOUND')
  })
})

describe('folders', () => {
  // Wrong behaviour caught: plain string order puts "Fotos 10" before "Fotos 2".
  it('lists folders by name with numbers in number order', async () => {
    const { owner } = (await setup()).as
    for (const name of ['Fotos 10', 'Fotos 2', 'Archiv']) await owner.mutation(api.files.createFolder, { site, name })
    expect((await owner.query(api.files.folders, { site })).map((f) => f.name)).toEqual(['Archiv', 'Fotos 2', 'Fotos 10'])
  })

  it('refuses to delete a folder that still holds a file or a subfolder', async () => {
    const s = await setup()
    const { owner } = s.as
    const folder = await owner.mutation(api.files.createFolder, { site, name: 'Speisekarten' })
    const sub = await owner.mutation(api.files.createFolder, { site, name: '2026', parent: folder })
    const file = await pdf(s)
    await owner.mutation(api.files.move, { site, files: [file], folder: sub })
    expect((await errorOf(owner.mutation(api.files.deleteFolder, { site, folder: folder }))).code).toBe('INVALID')
    expect((await errorOf(owner.mutation(api.files.deleteFolder, { site, folder: sub }))).code).toBe('INVALID')
    await owner.mutation(api.files.move, { site, files: [file], folder: null })
    await owner.mutation(api.files.deleteFolder, { site, folder: sub })
    await owner.mutation(api.files.deleteFolder, { site, folder })
    expect(await owner.query(api.files.folders, { site })).toEqual([])
  })

  it('refuses a move into itself or into a subfolder, and a second folder with the same name', async () => {
    const s = await setup()
    const { owner } = s.as
    const a = await owner.mutation(api.files.createFolder, { site, name: 'A' })
    const b = await owner.mutation(api.files.createFolder, { site, name: 'B', parent: a })
    const c = await owner.mutation(api.files.createFolder, { site, name: 'C', parent: b })
    for (const parent of [a, b, c]) expect((await errorOf(owner.mutation(api.files.moveFolder, { site, folder: a, parent }))).code).toBe('INVALID')
    expect((await errorOf(owner.mutation(api.files.createFolder, { site, name: ' a ' }))).code).toBe('INVALID')
    await owner.mutation(api.files.moveFolder, { site, folder: c, parent: null })
    expect((await owner.query(api.files.folders, { site })).find((f) => f.id === c)?.parent).toBeNull()
  })

  it('shows a folder\'s files in the folder view, and a file put there is kept', async () => {
    const s = await setup()
    const folder = await s.as.owner.mutation(api.files.createFolder, { site, name: 'Fotos' })
    const inside = await pdf(s, 'drin.pdf', '%PDF-1.4 drin')
    await pdf(s, 'draussen.pdf', '%PDF-1.4 draussen')
    await s.as.owner.mutation(api.files.move, { site, files: [inside], folder })
    const view = await s.as.owner.query(api.files.list, { site, view: 'all', folder })
    expect(view.files.map((f) => [f.name, f.kept])).toEqual([['drin.pdf', true]])
    const top = await s.as.owner.query(api.files.list, { site, view: 'all', folder: null })
    expect(top.files.map((f) => f.name)).toEqual(['draussen.pdf'])
  })

  it('a library upload with a folder is kept and lands in the folder; a folder of another site is NOT_FOUND', async () => {
    const s = await setup()
    const folder = await s.as.owner.mutation(api.files.createFolder, { site, name: 'Fotos' })
    const { ticket } = await s.as.cook.mutation(api.uploads.prepare, { site, folder })
    const body = (await (await postUpload(s, { ticket })).json()) as { upload: Id<'uploads'> }
    expect(await s.t.run((ctx) => ctx.db.get(body.upload))).toMatchObject({ folder, kept: true })
    const other = await s.as.stranger.mutation(api.files.createFolder, { site: 'andere', name: 'Fremd' })
    expect((await errorOf(s.as.owner.mutation(api.uploads.prepare, { site, folder: other }))).code).toBe('NOT_FOUND')
    const plain = await upload(s, { content: '%PDF-1.4 plain', name: 'plain.pdf' })
    expect(await s.t.run((ctx) => ctx.db.get(plain))).toMatchObject({ kept: false })
  })
})

describe('views', () => {
  it('"unused" lists ready files no entry uses, newest first', async () => {
    const s = await setup()
    const used = await readyImage(s)
    const free = await pdf(s)
    await useImage(s, used, { de: 'Foto', en: 'Photo' })
    const unused = await s.as.owner.query(api.files.list, { site, view: 'unused' })
    expect(unused.files.map((f) => f.id)).toEqual([free])
    const all = await s.as.owner.query(api.files.list, { site, view: 'recent' })
    expect(all.files.map((f) => [f.id, f.used])).toEqual([[free, false], [used, true]])
  })

  it('"missing alt" follows a save that fills the alt text, and info names where the file is used', async () => {
    const s = await setup()
    const file = await readyImage(s)
    const entry = await useImage(s, file, { de: 'Foto' })
    const missing = async () => (await s.as.owner.query(api.files.list, { site, view: 'missingAlt' })).files.map((f) => f.id)
    expect(await missing()).toEqual([file])
    expect((await s.as.owner.query(api.files.info, { site, file })).usedIn).toEqual([
      { entry, brick: 'events', title: 'Weinabend', paths: ['image'], fieldLabels: [{ de: 'Bild', en: 'Image' }], locale: 'en', missingAlt: true, deleted: false },
    ])

    await s.as.owner.mutation(api.entries.save, { site, opId: opId(), entry, baseRev: 1, fields: { image: { file, alt: { de: 'Foto', en: 'Photo' } } }, sentence: 'x' })
    expect(await missing()).toEqual([])
    const info = await s.as.owner.query(api.files.info, { site, file })
    expect(info.usedIn[0]).toMatchObject({ missingAlt: false })
    expect(info.altSuggestion).toEqual({ de: 'Foto', en: 'Photo' })
  })

  it('setAlt fills the only missing language: the file leaves the view and the count; the bundle shows library text, the field\'s own text wins', async () => {
    const s = await setup()
    const file = await readyImage(s)
    const entry = await useImage(s, file, { de: 'Foto' })
    const other = await useImage(s, file, { de: 'Eigenes Foto', en: 'Own photo' })
    const missing = async () => (await s.as.owner.query(api.files.list, { site, view: 'missingAlt' })).files.map((f) => f.id)
    expect(await missing()).toEqual([file])
    expect((await s.as.owner.query(api.files.counts, { site })).missingAlt).toBe(1)

    await s.as.owner.mutation(api.files.setAlt, { site, file, locale: 'en', text: '  Library photo  ' })
    expect(await missing()).toEqual([])
    expect((await s.as.owner.query(api.files.counts, { site })).missingAlt).toBe(0)
    expect(await fileRefsOf(s, file)).toMatchObject([{ missingAlt: false }, { missingAlt: false }])
    const info = await s.as.owner.query(api.files.info, { site, file })
    expect(info.alt).toEqual({ en: 'Library photo' })

    const item = async (id: Id<'entries'>, locale: string) => (((await (await s.t.fetch(`/bundle/restaurant?format=3&locale=${locale}`)).json()) as Bundle).bricks.events!.items!.find((i) => i.id === id)!.data as { image: { alt: string } }).image.alt
    expect(await item(entry, 'en')).toBe('Library photo')
    expect(await item(other, 'en')).toBe('Own photo')

    // An empty text removes the language again and the file is missing again.
    await s.as.owner.mutation(api.files.setAlt, { site, file, locale: 'en', text: '' })
    expect(await missing()).toEqual([file])
    expect((await s.as.owner.query(api.files.info, { site, file })).alt).toEqual({})
  })

  it('setAlt: staff may not, a PDF has no alt text, the language must exist, the text has a limit', async () => {
    const s = await setup()
    const file = await readyImage(s)
    const args = { site, file, locale: 'de', text: 'Foto' }
    expect((await errorOf(s.as.cook.mutation(api.files.setAlt, args))).code).toBe('FORBIDDEN')
    expect((await errorOf(s.as.owner.mutation(api.files.setAlt, { ...args, file: await pdf(s) }))).code).toBe('INVALID')
    expect((await errorOf(s.as.owner.mutation(api.files.setAlt, { ...args, locale: 'fr' }))).code).toBe('INVALID')
    expect((await errorOf(s.as.owner.mutation(api.files.setAlt, { ...args, text: 'x'.repeat(301) }))).code).toBe('INVALID')
    expect((await s.as.owner.query(api.files.info, { site, file })).alt).toEqual({})
  })

  it('an image field with empty alt saves when the library has the main-language text, and not without it', async () => {
    const s = await setup()
    const file = await readyImage(s)
    const create = () => s.as.owner.mutation(api.entries.create, {
      site, opId: opId(), brick: 'events',
      data: { title: { de: 'Weinabend' }, when: { from: '2026-11-01', to: '2026-11-02' }, description: { de: 'hi' }, image: { file, alt: {} } },
    })
    expect((await errorOf(create())).code).toBe('INVALID')
    await s.as.owner.mutation(api.files.setAlt, { site, file, locale: 'de', text: 'Foto' })
    await create()
  })

  it('the sidebar count is one per file, however many live entries show it without alt text; a removed entry is not counted', async () => {
    const s = await setup()
    const file = await readyImage(s)
    const first = await useImage(s, file, { de: 'Foto' })
    const second = await useImage(s, file, { de: 'Foto' })
    const count = async () => (await s.as.owner.query(api.files.counts, { site })).missingAlt
    expect(await count()).toBe(1)
    await s.as.owner.mutation(api.entries.remove, { site, opId: opId(), entry: first, lifeRev: 1 })
    expect(await count()).toBe(1)
    await s.as.owner.mutation(api.entries.remove, { site, opId: opId(), entry: second, lifeRev: 1 })
    expect(await count()).toBe(0)
  })

  it('"duplicates" groups files with the same hash and leaves single files out', async () => {
    const s = await setup()
    const a = await pdf(s, 'a.pdf', '%PDF-1.4 a')
    const b = await pdf(s, 'b.pdf', '%PDF-1.4 b')
    const c = await pdf(s, 'c.pdf', '%PDF-1.4 c')
    await s.t.run(async (ctx) => {
      await ctx.db.patch(a, { sha256: 'aa' })
      await ctx.db.patch(b, { sha256: 'aa' })
      await ctx.db.patch(c, { sha256: 'bb' })
    })
    const view = await s.as.owner.query(api.files.list, { site, view: 'duplicates' })
    expect(view.files.map((f) => f.id).sort()).toEqual([a, b].sort())
    expect(view.isDone).toBe(true)
  })

  it('search finds a name in any case; the trash view lists only trashed files', async () => {
    const s = await setup()
    const karte = await pdf(s, 'Wochenkarte.pdf', '%PDF-1.4 w')
    await pdf(s, 'preise.pdf', '%PDF-1.4 p')
    expect((await s.as.owner.query(api.files.list, { site, view: 'all', search: 'WOCHEN' })).files.map((f) => f.id)).toEqual([karte])
    await s.as.owner.mutation(api.files.trash, { site, files: [karte] })
    expect((await s.as.owner.query(api.files.list, { site, view: 'trash' })).files.map((f) => f.id)).toEqual([karte])
    expect((await s.as.owner.query(api.files.list, { site, view: 'all' })).files.map((f) => f.name)).toEqual(['preise.pdf'])
  })
})

describe('trash and restore', () => {
  it('refuses a used file and names the entry that uses it; unused files are trashed in the same call', async () => {
    const s = await setup()
    const used = await readyImage(s)
    const free = await pdf(s)
    const entry = await useImage(s, used, { de: 'Foto', en: 'Photo' })
    const result = await s.as.owner.mutation(api.files.trash, { site, files: [used, free] })
    expect(result.trashed).toEqual([free])
    expect(result.refused).toEqual([{ file: used, name: 'foto.jpg', usedIn: [{ entry, brick: 'events', title: 'Weinabend', paths: ['image'], fieldLabels: [{ de: 'Bild', en: 'Image' }], locale: null, missingAlt: false, deleted: false }] }])
    expect((await s.t.run((ctx) => ctx.db.get(used)))!.trashedAt).toBeUndefined()
  })

  it('a file used only by a deleted entry is still refused', async () => {
    const s = await setup()
    const file = await readyImage(s)
    const entry = await useImage(s, file, { de: 'Foto', en: 'Photo' })
    await s.as.owner.mutation(api.entries.remove, { site, opId: opId(), entry, lifeRev: 1 })
    const result = await s.as.owner.mutation(api.files.trash, { site, files: [file] })
    expect(result.trashed).toEqual([])
    expect(result.refused[0]!.usedIn).toMatchObject([{ entry, deleted: true }])
  })

  it('restore brings a trashed file back, and a trashed file cannot be put into an entry', async () => {
    const s = await setup()
    const file = await readyImage(s)
    await s.as.owner.mutation(api.files.trash, { site, files: [file] })
    const refused = await errorOf(useImage(s, file, { de: 'Foto' }))
    expect(refused.code).toBe('INVALID')
    expect(await s.as.owner.mutation(api.files.restore, { site, files: [file] })).toEqual({ restored: [file] })
    expect((await s.as.owner.query(api.files.list, { site, view: 'all' })).files.map((f) => f.id)).toEqual([file])
    await useImage(s, file, { de: 'Foto', en: 'Photo' })
  })
})

describe('replace', () => {
  it('keeps the references, takes the new content and moves the old storage to previous', async () => {
    const s = await setup()
    const file = await readyImage(s)
    const entry = await useImage(s, file, { de: 'Foto', en: 'Photo' })
    const before = (await s.t.run((ctx) => ctx.db.get(file)))!
    const next = await readyImage(s, 'neu.jpg', [0xff, 0xd8, 0xff, 0xe0, 1, 2, 3])
    const nextRow = (await s.t.run((ctx) => ctx.db.get(next)))!

    const revBefore = (await s.t.run((ctx) => ctx.db.query('sites').first()))!.contentRev
    await s.as.owner.mutation(api.files.replace, { site, file, upload: next })

    expect((await s.t.run((ctx) => ctx.db.query('sites').first()))!.contentRev).toBe(revBefore + 1)
    const after = (await s.t.run((ctx) => ctx.db.get(file)))!
    expect(after).toMatchObject({ name: 'foto.jpg', storageId: nextRow.storageId, processedId: nextRow.processedId, hasPrevious: true })
    expect(after.previous).toMatchObject([{ storageId: before.storageId, processedId: before.processedId }])
    expect(await s.t.run((ctx) => ctx.db.get(next))).toBeNull()
    expect((await fileRefsOf(s, file)).map((r) => r.holderId)).toContain(entry)
    expect((await s.t.run((ctx) => ctx.db.get(entry)))!.data.image).toMatchObject({ file })
    // The old stored file is still there for the 30 days.
    expect(await s.t.run((ctx) => ctx.db.system.get(before.storageId))).not.toBeNull()
  })

  it('delivers the focus point in the bundle, and a replace takes it away', async () => {
    const s = await setup()
    const file = await readyImage(s)
    const entry = await useImage(s, file, { de: 'Foto' })
    const imageOf = async () => {
      const bundle = (await (await s.t.fetch('/bundle/restaurant?format=3&locale=de')).json()) as { bricks: Record<string, { items: { id: string; data: { image?: object } }[] }> }
      return bundle.bricks.events!.items.find((i) => i.id === entry)!.data.image
    }
    expect(await imageOf()).not.toHaveProperty('focus')

    await s.as.owner.mutation(api.files.setFocus, { site, file, focus: { x: 0.3, y: 0.7 } })
    expect(await imageOf()).toMatchObject({ focus: { x: 0.3, y: 0.7 } })

    const next = await readyImage(s, 'neu.jpg', [0xff, 0xd8, 0xff, 0xe0, 1, 2, 3])
    await s.as.owner.mutation(api.files.replace, { site, file, upload: next })
    expect(await imageOf()).not.toHaveProperty('focus')
  })

  it('refuses a PDF in place of an image and an image in place of a PDF', async () => {
    const s = await setup()
    const image = await readyImage(s)
    const doc = await pdf(s)
    expect((await errorOf(s.as.owner.mutation(api.files.replace, { site, file: image, upload: doc }))).code).toBe('INVALID')
    expect((await errorOf(s.as.owner.mutation(api.files.replace, { site, file: doc, upload: image }))).code).toBe('INVALID')
    expect((await s.t.run((ctx) => ctx.db.get(image)))!.previous).toBeUndefined()
  })
})

describe('uploads.sweep with the library', () => {
  it('skips kept and foldered uploads, and still removes an unreferenced plain one after 7 days', async () => {
    vi.setSystemTime(new Date('2026-10-01T00:00:00Z'))
    const s = await setup()
    const folder = await s.as.owner.mutation(api.files.createFolder, { site, name: 'Fotos' })
    const plain = await pdf(s, 'a.pdf', '%PDF-1.4 a')
    const kept = await pdf(s, 'b.pdf', '%PDF-1.4 b')
    const foldered = await pdf(s, 'c.pdf', '%PDF-1.4 c')
    const trashed = await pdf(s, 'd.pdf', '%PDF-1.4 d')
    await s.as.owner.mutation(api.files.keep, { site, files: [kept] })
    await s.as.owner.mutation(api.files.move, { site, files: [foldered], folder })
    await s.as.owner.mutation(api.files.trash, { site, files: [trashed] })
    vi.setSystemTime(new Date('2026-10-08T01:00:00Z'))
    for (const phase of ['storage', 'processing', 'failed', 'ready'] as const) await s.t.mutation(internal.uploads.sweep, { phase })
    const left = await s.t.run((ctx) => ctx.db.query('uploads').collect())
    expect(left.map((r) => r._id).sort()).toEqual([kept, foldered, trashed].sort())
  })

  // Wrong behaviour caught: a picture placed in a Markdown text had no file reference, so the sweep purged it after
  // 7 days and the published text showed a hole.
  it('keeps an image that a Markdown text uses', async () => {
    vi.setSystemTime(new Date('2026-10-01T00:00:00Z'))
    const s = await setup()
    await s.t.run(async (ctx) => {
      const schema = (await ctx.db.get(s.site))!.schema as Schema
      ;(schema.bricks.legal!.fields.imprint as { profile: string }).profile = 'rich'
      await ctx.db.patch(s.site, { schema })
    })
    const id = await readyImage(s)
    await s.as.owner.mutation(api.entries.save, { site, opId: opId(), entry: s.entries.legal!, baseRev: 1, fields: { imprint: { de: `![Hund]($file.${id})` } }, sentence: 'x' })
    vi.setSystemTime(new Date('2026-10-09T00:00:00Z'))
    for (const phase of ['storage', 'processing', 'failed', 'ready'] as const) await s.t.mutation(internal.uploads.sweep, { phase })
    expect(await s.t.run((ctx) => ctx.db.get(id))).not.toBeNull()
    expect(await fileRefsOf(s, id)).toHaveLength(1)
  })

  it('does not delete the storage of a replaced file as an orphan', async () => {
    vi.setSystemTime(new Date('2026-10-01T00:00:00Z'))
    const s = await setup()
    const file = await pdf(s, 'a.pdf', '%PDF-1.4 a')
    const next = await pdf(s, 'b.pdf', '%PDF-1.4 b')
    const old = (await s.t.run((ctx) => ctx.db.get(file)))!.storageId
    await s.as.owner.mutation(api.files.replace, { site, file, upload: next })
    vi.setSystemTime(new Date('2026-10-03T00:00:00Z'))
    await s.t.mutation(internal.uploads.sweep, { phase: 'storage' })
    expect(await s.t.run((ctx) => ctx.db.system.get(old))).not.toBeNull()
  })
})

/** A ready image with two variant files, stored widest first to show that the bundle sorts them. */
async function imageWithVariants(s: Setup) {
  const file = await readyImage(s)
  const stored = await s.t.run(async (ctx) => {
    const wide = await ctx.storage.store(new Blob(['960'], { type: 'image/webp' }))
    const narrow = await ctx.storage.store(new Blob(['480'], { type: 'image/webp' }))
    await ctx.db.patch(file, { width: 2000, height: 1000, variants: [{ width: 960, storageId: wide }, { width: 480, storageId: narrow }] })
    return [wide, narrow]
  })
  return { file, stored }
}

describe('image variants', () => {
  it('puts the variant URLs into the bundle, ascending', async () => {
    const s = await setup()
    const { file, stored } = await imageWithVariants(s)
    const entry = await useImage(s, file, { de: 'Wein' })
    const bundle = (await (await s.t.fetch(`/bundle/${site}?format=3&locale=de`)).json()) as { bricks: Record<string, { items: { id: string; data: { image?: { variants?: { width: number; url: string }[] } } }[] }> }
    const info = bundle.bricks.events!.items.find((i) => i.id === entry)!.data.image!
    const urls = await s.t.run((ctx) => Promise.all(stored.map((id) => ctx.storage.getUrl(id))))
    expect(info.variants).toEqual([{ width: 480, url: urls[1] }, { width: 960, url: urls[0] }])
  })

  it('removes the variant storage when the trash is purged', async () => {
    const s = await setup()
    const { file, stored } = await imageWithVariants(s)
    await s.as.owner.mutation(api.files.trash, { site, files: [file] })
    vi.setSystemTime(CORPUS_NOW + 31 * DAY)
    await s.t.mutation(internal.retention.daily, {})
    expect(await s.t.run((ctx) => ctx.db.get(file))).toBeNull()
    expect(await s.t.run((ctx) => Promise.all(stored.map((id) => ctx.db.system.get(id))))).toEqual([null, null])
  })

  it('keeps variants of a replaced file for 30 days, then deletes them, and the daily sweep leaves them alone', async () => {
    const s = await setup()
    const { file, stored } = await imageWithVariants(s)
    const next = await readyImage(s, 'neu.jpg', [0xff, 0xd8, 0xff, 0xe0, 1, 1])
    await s.as.owner.mutation(api.files.replace, { site, file, upload: next })
    expect((await s.t.run((ctx) => ctx.db.get(file)))!.variants).toBeUndefined()
    vi.setSystemTime(CORPUS_NOW + 2 * DAY)
    await s.t.mutation(internal.uploads.sweep, { phase: 'storage' })
    expect(await s.t.run((ctx) => Promise.all(stored.map((id) => ctx.db.system.get(id))))).not.toContain(null)
    vi.setSystemTime(CORPUS_NOW + 31 * DAY)
    await s.t.mutation(internal.retention.daily, {})
    expect(await s.t.run((ctx) => Promise.all(stored.map((id) => ctx.db.system.get(id))))).toEqual([null, null])
  })
})

describe('retention of trash and replaced files', () => {
  it('purges the trash after 30 days only when no reference remains', async () => {
    const s = await setup()
    const free = await pdf(s, 'a.pdf', '%PDF-1.4 a')
    const historic = await pdf(s, 'b.pdf', '%PDF-1.4 b')
    const young = await pdf(s, 'c.pdf', '%PDF-1.4 c')
    await s.as.owner.mutation(api.files.trash, { site, files: [free, historic] })
    // A change row still shows the file (the content history keeps it for a year).
    await s.t.run((ctx) => ctx.db.insert('fileRefs', { site: s.site, file: historic, holder: 'change', holderId: 'aenderung-1' }))
    const stored = (await s.t.run((ctx) => ctx.db.get(free)))!.storageId

    vi.setSystemTime(CORPUS_NOW + 29 * DAY)
    // Sessions last a day, so later trashing is written directly.
    await s.t.run((ctx) => ctx.db.patch(young, { trashedAt: Date.now() }))
    await s.t.mutation(internal.retention.daily, {})
    expect(await s.t.run((ctx) => ctx.db.get(free))).not.toBeNull()

    vi.setSystemTime(CORPUS_NOW + 31 * DAY)
    await s.t.mutation(internal.retention.daily, {})
    expect(await s.t.run((ctx) => ctx.db.get(free))).toBeNull()
    expect(await s.t.run((ctx) => ctx.db.system.get(stored))).toBeNull()
    expect(await s.t.run((ctx) => ctx.db.get(historic))).not.toBeNull()
    expect(await s.t.run((ctx) => ctx.db.get(young))).not.toBeNull()
  })

  it('deletes the storage of a replaced file after 30 days, not before', async () => {
    const s = await setup()
    const file = await pdf(s, 'a.pdf', '%PDF-1.4 a')
    const next = await pdf(s, 'b.pdf', '%PDF-1.4 b')
    const old = (await s.t.run((ctx) => ctx.db.get(file)))!.storageId
    await s.as.owner.mutation(api.files.replace, { site, file, upload: next })

    vi.setSystemTime(CORPUS_NOW + 29 * DAY)
    await s.t.mutation(internal.retention.daily, {})
    expect(await s.t.run((ctx) => ctx.db.system.get(old))).not.toBeNull()

    vi.setSystemTime(CORPUS_NOW + 31 * DAY)
    await s.t.mutation(internal.retention.daily, {})
    expect(await s.t.run((ctx) => ctx.db.system.get(old))).toBeNull()
    const row = (await s.t.run((ctx) => ctx.db.get(file)))!
    expect([row.previous, row.hasPrevious]).toEqual([undefined, undefined])
  })
})

describe('backup', () => {
  it('keeps folders and an unused library file with its folder, kept flag and focus point', async () => {
    const s = await setup()
    const folder = await s.as.owner.mutation(api.files.createFolder, { site, name: 'Fotos' })
    const file = await readyImage(s)
    await s.as.owner.mutation(api.files.move, { site, files: [file], folder })
    await s.as.owner.mutation(api.files.setFocus, { site, file, focus: { x: 0.25, y: 0.75 } })
    const loose = await pdf(s)
    const snapshot = await s.t.query(internal.backup.snapshot, { site: s.site })
    expect(snapshot.folders).toEqual([{ id: folder, name: 'Fotos' }])
    expect(snapshot.files.map((f) => f.id)).toEqual([file])
    expect(snapshot.files[0]).toMatchObject({ folder, kept: true, focus: { x: 0.25, y: 0.75 } })
    expect(snapshot.files.map((f) => f.id)).not.toContain(loose)
  })
})

describe('files.rebuildRefs', () => {
  it('finds a removed file reference row, and writes it back only with fix', async () => {
    const s = await setup()
    const file = await readyImage(s)
    const entry = await useImage(s, file, { de: 'Foto' })
    const [ref] = await fileRefsOf(s, file)
    await s.t.run((ctx) => ctx.db.delete(ref!._id))

    const found = await s.t.mutation(internal.files.rebuildRefs, { site: s.site })
    expect(found).toMatchObject({ missing: [{ entry, file }], extra: [], stale: [], fixed: false })
    expect(await fileRefsOf(s, file)).toHaveLength(0)

    await s.t.mutation(internal.files.rebuildRefs, { site: s.site, fix: true })
    expect(await fileRefsOf(s, file)).toMatchObject([{ holderId: entry, uses: [{ path: 'image', missingAlt: true }], missingAlt: true }])
    expect(await s.t.mutation(internal.files.rebuildRefs, { site: s.site })).toMatchObject({ missing: [], extra: [], stale: [] })
  })

  it('reports a reference without a use as extra', async () => {
    const s = await setup()
    const file = await pdf(s)
    await s.t.run((ctx) => ctx.db.insert('fileRefs', { site: s.site, file, holder: 'entry', holderId: s.entries['menu-saibling']! }))
    expect(await s.t.mutation(internal.files.rebuildRefs, { site: s.site })).toMatchObject({ extra: [{ entry: s.entries['menu-saibling'], file }] })
  })
})
