// Import keeps references between entries (remapEntryRefs, seed:importRefs) and a hosted site takes an import only while
// an operator has opened it (seed:importOpen), and only when it is empty.
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { makeFunctionReference } from 'convex/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { checkImport, importSite } from '../../../packages/ginko/src/cli/import.ts'
import type { Runner } from '../../../packages/ginko/src/cli/local.ts'
import type { Fields } from '@lupinum/ginko'
import { printOf, type Schema } from '@lupinum/ginko/internal'
import { remapEntryRefs } from '../convex/lib/content'
import { readTreesJson } from '../convex/lib/trees'
import { api } from '../convex/_generated/api'
import { errorOf, setup } from './setup'

type Setup = Awaited<ReturnType<typeof setup>>

const label = { de: 'x', en: 'x' }
const fields = {
  author: { type: 'ref', to: 'authors', label },
  more: { type: 'ref', to: 'authors', multiple: true, label },
  credits: { type: 'list', label, itemLabel: label, max: 5, of: { who: { type: 'ref', to: 'authors', label }, role: { type: 'boolean', label } } },
} as unknown as Fields

describe('remapEntryRefs', () => {
  it('replaces known ids in a single ref, a refs list and a list row; unknown ids and other values stay', () => {
    const map = new Map([['authors/a', 'NEW_A'], ['authors/b', 'NEW_B']])
    const data = {
      author: 'authors/a',
      more: ['authors/b', 'authors/gone', 'authors/a'],
      credits: [{ _id: 'r1', who: 'authors/b', role: true }, { _id: 'r2', who: 'authors/gone', role: false }],
      title: 'authors/a',
    }
    expect(remapEntryRefs(fields, data, map)).toEqual({
      author: 'NEW_A',
      more: ['NEW_B', 'authors/gone', 'NEW_A'],
      credits: [{ _id: 'r1', who: 'NEW_B', role: true }, { _id: 'r2', who: 'authors/gone', role: false }],
      title: 'authors/a',
    })
  })
})

const dirs: string[] = []
afterEach(async () => {
  vi.unstubAllEnvs()
  for (const dir of dirs.splice(0)) await rm(dir, { recursive: true, force: true })
})

/** The bricks of the tests below: `authors`, `posts` with the ref fields above, and `notes` with a text. */
const refBricks = {
  authors: { kind: 'collection', label, fields: { name: { type: 'text', label } } },
  posts: { kind: 'collection', label, fields },
  notes: { kind: 'collection', label, fields: { body: { type: 'markdown', label } } },
}

/** The site with the bricks above in its stored schema. */
async function withRefBricks(s: Setup, site: Setup['site']) {
  await s.t.run(async (ctx) => {
    const row = (await ctx.db.get(site))!
    const schema = row.schema as { bricks: Record<string, unknown> }
    Object.assign(schema.bricks, structuredClone(refBricks))
    await ctx.db.patch(site, { schema })
  })
}

const exported = (id: string, brick: string, order: number, data: unknown, prints = {}) => ({ id, brick, kind: 'item', order, data, prints, rev: 1 })

async function exportFolder(entries = [
  // The post comes first on purpose: its author is imported after it.
  exported('posts/hello', 'posts', 1, { author: 'authors/anna', more: ['authors/anna'], credits: [{ _id: 'r1', who: 'authors/anna', role: true }] }),
  exported('authors/anna', 'authors', 1, { name: { de: 'Anna' } }),
]) {
  const dir = await mkdtemp(join(tmpdir(), 'ginko-refs-test-'))
  dirs.push(dir)
  await writeFile(join(dir, 'export.json'), JSON.stringify({
    format: 1, site: 'restaurant', name: 'R', schema: { locales: ['de', 'en'], bricks: refBricks, migrations: [], retired: {} }, schemaRev: 1, contentRev: 1,
    exportedAt: '2026-10-11T00:00:00.000Z', files: [], entries,
  }))
  return dir
}

function runnerOf(s: Setup) {
  const calls: string[] = []
  const run: Runner = async (fn, args) => {
    calls.push(fn)
    if (fn === 'release:devPush') return { warnings: [] }
    return fn === 'seed:importBatch' ? s.t.action(makeFunctionReference<'action'>(fn), args) : fn === 'seed:importStatus' ? s.t.query(makeFunctionReference<'query'>(fn), args) : s.t.mutation(makeFunctionReference<'mutation'>(fn), args)
  }
  const upload = (_url: string, bytes: Uint8Array, mime: string) => s.t.run((ctx) => ctx.storage.store(new Blob([bytes], { type: mime })))
  return { run, upload, calls }
}

const entriesOf = (s: Setup, site: Setup['site']) => s.t.run(async (ctx) => (await ctx.db.query('entries').collect()).filter((e) => e.site === site))

describe('import keeps references between entries', () => {
  it('points ref, refs and list-row refs at the new id of the imported entry and keeps the budget exact', async () => {
    vi.stubEnv('GINKO_LOCAL', '1')
    const s = await setup()
    await withRefBricks(s, s.site)
    const { run, upload, calls } = runnerOf(s)
    await importSite({ dir: await exportFolder(), run, upload, log: () => undefined })
    expect(calls).toContain('seed:importRefs')

    const rows = await entriesOf(s, s.site)
    const anna = rows.find((e) => e.brick === 'authors')!
    const post = rows.find((e) => e.brick === 'posts')!
    expect(post.data).toEqual({ author: anna._id, more: [anna._id], credits: [{ _id: 'r1', who: anna._id, role: true }] })
    const site = (await s.t.run((ctx) => ctx.db.get(s.site)))!
    expect(site.bytes).toBe(rows.reduce((sum, e) => sum + e.bytes, 0))
  })

  // Wrong behaviour caught: a link to an entry (`$authors.<id>`, what the Studio's link dialog stores) kept the exported
  // ID after a restore or `local:pull`, so the site showed it as broken; or the stored text changed while the served
  // trees kept the old ID, or a translation that was current became outdated.
  it('points a link in a text at the new id, in the stored text and its served trees, and a current translation stays current', async () => {
    vi.stubEnv('GINKO_LOCAL', '1')
    const s = await setup()
    await withRefBricks(s, s.site)
    const old = 'k17anna00000000000000000000000000'
    const body = { de: `Von [Anna]($authors.${old}#bio), siehe [Karte]($page.menu).`, en: `By [Anna]($authors.${old}#bio).` }
    const { run, upload } = runnerOf(s)
    await importSite({ dir: await exportFolder([
      exported('k17note00000000000000000000000000', 'notes', 1, { body }, { body: { en: printOf(body.de) } }),
      exported(old, 'authors', 1, { name: { de: 'Anna' } }),
    ]), run, upload, log: () => undefined })

    const rows = await entriesOf(s, s.site)
    const anna = rows.find((e) => e.brick === 'authors')!
    const note = rows.find((e) => e.brick === 'notes')!
    const now = { de: `Von [Anna]($authors.${anna._id}#bio), siehe [Karte]($page.menu).`, en: `By [Anna]($authors.${anna._id}#bio).` }
    expect(note.data).toEqual({ body: now })
    const trees = await s.t.run((ctx) => readTreesJson(ctx, note._id))
    expect([trees.includes(`$authors.${anna._id}#bio`), trees.includes(old)]).toEqual([true, false])
    expect(note.prints).toEqual({ body: { en: printOf(now.de) } })
    const site = (await s.t.run((ctx) => ctx.db.get(s.site)))!
    expect([site.bytes, site.treeBytes]).toEqual([rows.reduce((sum, e) => sum + e.bytes, 0), rows.reduce((sum, e) => sum + (e.treeBytes ?? 0), 0)])
  })

  // A post that names a short files-export ID 20000 times: 234 KiB in the export, 684 KiB once each `authors/a` is a
  // 32-character Convex ID. Wrong behaviour caught: the size is checked before the rewrite only, so the import clears the
  // site and stores an entry the Studio then refuses to grow.
  const manyRefs = [
    { id: 'posts/many', brick: 'posts', kind: 'item' as const, order: 1, data: { more: Array<string>(20000).fill('authors/a') }, prints: {}, rev: 1 },
    { id: 'authors/a', brick: 'authors', kind: 'item' as const, order: 1, data: { name: { de: 'Anna' } }, prints: {}, rev: 1 },
  ]

  it('the CLI counts references with the length of their new IDs before it clears anything', async () => {
    const s = await setup()
    await withRefBricks(s, s.site)
    const schema = (await s.t.run((ctx) => ctx.db.get(s.site)))!.schema as Schema
    expect(await checkImport(schema, manyRefs)).toEqual(['Entry posts/many (posts) is 684 KiB; the limit is 480 KiB.'])
  })

  it('the platform refuses a reference rewrite that grows an entry past its limit', async () => {
    vi.stubEnv('GINKO_LOCAL', '1')
    const s = await setup()
    await withRefBricks(s, s.site)
    const call = (fn: string, args: Record<string, unknown>) => s.t.mutation(makeFunctionReference<'mutation'>(fn), args)
    const { ids } = (await call('seed:importExport', { site: 'restaurant', files: [], entries: manyRefs })) as { ids: [string, string][] }
    expect(await errorOf(call('seed:importRefs', { site: 'restaurant', ids: ids.map(([from, to]) => ({ from, to })) }))).toMatchObject({ code: 'TOO_LARGE', message: 'Eintrag „posts/many“ ist zu groß (684 KB, höchstens 480 KB).' })
    const post = (await entriesOf(s, s.site)).find((e) => e.brick === 'posts')!
    expect(post.data).toEqual({ more: Array<string>(20000).fill('authors/a') })
  })
})

describe('import keeps what the Studio keeps', () => {
  const services = { kind: 'collection', label, max: 2, route: { de: '/leistungen/[slug]' }, fields: { title: { type: 'text', label }, slug: { type: 'slug', from: 'title', label } } }
  const service = (id: string, slug: string) => ({ id, brick: 'services', kind: 'item' as const, order: 1, data: { title: { de: id }, slug: { de: slug } }, prints: {}, rev: 1 })

  // Wrong behaviour caught: an import stores a collection over its max (its removed entries can then never come back),
  // an entry twice, or two entries at one URL, and the operator learns it only from the broken site.
  it.each([
    {
      case: 'a collection over its max', entries: [service('services/a', 'a'), service('services/b', 'b'), service('services/c', 'c')],
      cli: 'The collection “services” has 3 entries; it takes at most 2.', server: 'Die Sammlung „services“ hat 3 Einträge, höchstens 2 gehen.',
    },
    {
      case: 'an entry ID twice', entries: [service('services/a', 'a'), service('services/a', 'b')],
      cli: 'The entry “services/a” appears twice.', server: 'Der Eintrag „services/a“ kommt zweimal vor.',
    },
    {
      case: 'two entries with one URL', entries: [service('services/a', 'webseiten'), service('services/b', 'webseiten')],
      cli: '“services/a” and “services/b” have the same address /leistungen/webseiten.', server: '„services/a“ und „services/b“ haben dieselbe Adresse /leistungen/webseiten.',
    },
  ])('refuses $case, in the CLI before anything is cleared and on the platform', async ({ entries, cli, server }) => {
    vi.stubEnv('GINKO_LOCAL', '1')
    const s = await setup()
    const schema = await s.t.run(async (ctx) => {
      const row = (await ctx.db.get(s.site))!
      const stored = row.schema as { bricks: Record<string, unknown> }
      stored.bricks.services = services
      await ctx.db.patch(s.site, { schema: stored })
      return stored as unknown as Schema
    })
    expect(await checkImport(schema, entries)).toEqual([cli])
    const before = (await entriesOf(s, s.site)).length
    expect(await errorOf(s.t.mutation(makeFunctionReference<'mutation'>('seed:importExport'), { site: 'restaurant', files: [], entries }))).toMatchObject({ code: 'INVALID', message: server })
    expect((await entriesOf(s, s.site)).length).toBe(before)
  })
})

/** Whether a value holds an object with more than 1024 fields: Convex refuses such an argument or answer, convex-test does not. */
const tooManyFields = (value: unknown): boolean => Array.isArray(value)
  ? value.some(tooManyFields)
  : typeof value === 'object' && value !== null && (Object.keys(value).length > 1024 || Object.values(value).some(tooManyFields))

describe('import of a big site', () => {
  // Wrong behaviour caught: one batch of many small entries answers with one object field per entry, or the reference
  // rewrite takes one object field per referenced entry; Convex refuses either past 1024, so the import stops at the
  // same point on every run.
  it('imports an export with 1,990 small entries that each point at the next one', async () => {
    vi.stubEnv('GINKO_LOCAL', '1')
    const s = await setup()
    // A collection holds at most 500 entries: four of them.
    const bricks = Object.fromEntries([0, 1, 2, 3].map((n) => [`faq${n}`, { kind: 'collection', label, max: 500, fields: { question: { type: 'text', label }, next: { type: 'ref', to: `faq${(n + 1) % 4}`, label } } }]))
    await s.t.run(async (ctx) => {
      const schema = (await ctx.db.get(s.site))!.schema as { bricks: Record<string, unknown> }
      Object.assign(schema.bricks, bricks)
      await ctx.db.patch(s.site, { schema })
    })
    const dir = await mkdtemp(join(tmpdir(), 'ginko-big-test-'))
    dirs.push(dir)
    const entries = Array.from({ length: 1990 }, (_, i) => ({
      id: `faq${i % 4}/q${i}`, brick: `faq${i % 4}`, kind: 'item', order: i, prints: {}, rev: 1,
      data: { question: { de: `Frage ${i}: ${'x'.repeat(300)}` }, ...(i < 1989 ? { next: `faq${(i + 1) % 4}/q${i + 1}` } : {}) },
    }))
    await writeFile(join(dir, 'export.json'), JSON.stringify({
      format: 1, site: 'restaurant', name: 'R', schema: { locales: ['de', 'en'], bricks, migrations: [], retired: {} }, schemaRev: 1, contentRev: 1,
      exportedAt: '2026-10-11T00:00:00.000Z', files: [], entries,
    }))
    const { run, upload } = runnerOf(s)
    const limited: Runner = async (fn, args) => {
      const result = await run(fn, args)
      if (tooManyFields(args) || tooManyFields(result)) throw new Error(`${fn}: Object has too many fields`)
      return result
    }
    await importSite({ dir, run: limited, upload, log: () => undefined })
    const rows = await entriesOf(s, s.site)
    expect(rows.length).toBe(1990)
    // Each `next` names the new ID of the entry with the following number.
    const numberOf = (entry: { data: { question: { de: string } } } | undefined) => Number(/^Frage (\d+):/.exec(entry?.data.question.de ?? '')?.[1])
    const byId = new Map<string, (typeof rows)[number]>(rows.map((e) => [e._id, e]))
    const pointsRight = rows.filter((e) => numberOf(byId.get(e.data.next)) === numberOf(e) + 1)
    expect(pointsRight.length).toBe(1989)
  }, 60_000)
})

describe('entries.usedBy', () => {
  // Wrong behaviour caught: removing an author gives no warning, and the posts that show it silently lose it.
  it('lists the live posts that point at an author, by ref, refs or list row', async () => {
    const s = await setup()
    await withRefBricks(s, s.site)
    const anna = await s.t.run(async (ctx) => {
      const row = (await ctx.db.get(s.site))!
      const schema = row.schema as { bricks: Record<string, { fields: Record<string, unknown> }> }
      schema.bricks.posts!.fields.title = { type: 'text', label }
      await ctx.db.patch(s.site, { schema })
      const insert = (brick: string, data: Record<string, unknown>, deletedAt?: number) => ctx.db.insert('entries', {
        site: s.site, brick, kind: 'item', order: 1, data, rev: 1, fieldRevs: {}, lifeRev: 1, prints: {}, bytes: 2, ...(deletedAt ? { deletedAt } : {}),
      })
      const author = await insert('authors', { name: 'Anna' })
      await insert('posts', { title: 'P1', author, more: [author] })
      await insert('posts', { title: 'P2', credits: [{ _id: 'r1', who: author, role: true }] })
      await insert('posts', { title: 'P3', author }, Date.now())
      await insert('posts', { title: 'P4', more: ['someone-else'] })
      return author
    })
    const uses = await s.as.owner.query(api.entries.usedBy, { site: 'restaurant', entry: anna })
    expect(uses.map((u) => [u.title, u.paths])).toEqual([['P1', ['author', 'more']], ['P2', ['credits.r1.who']]])
  })
})

describe('hosted import guard', () => {
  it('opens only an empty site, takes the import only while open, never clears, and closes again', async () => {
    const s = await setup()
    const call = (fn: string, args: Record<string, unknown>) => s.t.mutation(makeFunctionReference<'mutation'>(fn), args)
    const dir = await exportFolder()
    await withRefBricks(s, s.other)

    // Not local and not open: refused, also for the file upload and the clear.
    for (const [fn, args] of [['seed:importExport', { site: 'andere', files: [], entries: [] }], ['seed:uploadUrl', { site: 'andere' }], ['seed:importRefs', { site: 'andere', ids: [] }], ['seed:importClear', { site: 'andere' }]] as const) {
      expect([fn, (await errorOf(call(fn, args))).code]).toEqual([fn, 'FORBIDDEN'])
    }
    // A site with content cannot be opened; the empty one can.
    expect((await errorOf(call('seed:importOpen', { site: 'restaurant' }))).code).toBe('INVALID')
    expect(await call('seed:importOpen', { site: 'andere' })).toMatchObject({ open: true })
    // Open: the import steps work, the clear still does not.
    await expect(call('seed:importExport', { site: 'andere', files: [], entries: [] })).resolves.toMatchObject({ entries: 0 })
    expect((await errorOf(call('seed:importClear', { site: 'andere' }))).code).toBe('FORBIDDEN')
    // Another site stays closed.
    expect((await errorOf(call('seed:importExport', { site: 'restaurant', files: [], entries: [] }))).code).toBe('FORBIDDEN')

    // The CLI path: checks the released bricks, imports, rewrites refs, closes the site.
    const { run, upload, calls } = runnerOf(s)
    await call('seed:importDone', { site: 'andere' })
    await importSite({ dir, run, upload, log: () => undefined, prod: true, site: 'andere' })
    expect(calls).not.toContain('release:devPush')
    expect(calls).not.toContain('seed:importClear')
    expect(calls.at(-1)).toBe('seed:importDone')
    const rows = await entriesOf(s, s.other)
    expect(rows.find((e) => e.brick === 'posts')!.data).toMatchObject({ author: rows.find((e) => e.brick === 'authors')!._id })
    expect((await s.t.run((ctx) => ctx.db.get(s.other)))!.importOpen).toBeUndefined()
    expect((await errorOf(call('seed:importExport', { site: 'andere', files: [], entries: [] }))).code).toBe('FORBIDDEN')

    // The site now has entries: no second import,.
    expect((await errorOf(call('seed:importOpen', { site: 'andere' }))).code).toBe('INVALID')
  })

  it('stops before it opens the site when the released schema lacks a brick of the export', async () => {
    const s = await setup()
    const { run, upload, calls } = runnerOf(s)
    await expect(importSite({ dir: await exportFolder(), run, upload, log: () => undefined, prod: true, site: 'andere' })).rejects.toThrow(/ginko release/)
    expect(calls).toEqual(['seed:importStatus'])
  })
})

describe('import checks each entry like a save', () => {
  it('refuses a batch whose entry the editor could not open, names the entry, and stores nothing of it', async () => {
    vi.stubEnv('GINKO_LOCAL', '1')
    const s = await setup()
    await withRefBricks(s, s.site)
    const before = (await entriesOf(s, s.site)).length
    const entry = (id: string, data: unknown) => ({ id, brick: 'authors', kind: 'item' as const, order: 1, data, prints: {}, rev: 1 })
    // A Markdown-style tree where the field holds text: what the first files-export wrote.
    const error = await errorOf(s.t.mutation(makeFunctionReference<'mutation'>('seed:importExport'), {
      site: 'restaurant', files: [], entries: [entry('authors/ok', { name: { de: 'Anna' } }), entry('authors/bad', { name: { de: { nodes: [['p', {}, 'Anna']] } } })],
    }))
    expect(error).toMatchObject({ code: 'INVALID' })
    expect(JSON.stringify(error)).toContain('authors/bad')
    expect((await entriesOf(s, s.site)).length).toBe(before)
  })

  // Wrong behaviour caught: a removed entry is never checked (restore checks nothing either), and values a save refuses
  // today are stored without a word, so the operator never learns about them.
  it('checks removed entries too, and stores values the Studio would refuse today as warnings', async () => {
    vi.stubEnv('GINKO_LOCAL', '1')
    const s = await setup()
    await withRefBricks(s, s.site)
    const before = (await entriesOf(s, s.site)).length
    const call = (entries: unknown[]) => s.t.mutation(makeFunctionReference<'mutation'>('seed:importExport'), { site: 'restaurant', files: [], entries })
    const entry = (id: string, data: unknown, deletedAt?: number) => ({ id, brick: 'authors', kind: 'item' as const, order: 1, data, prints: {}, rev: 1, ...(deletedAt ? { deletedAt } : {}) })

    expect(await errorOf(call([entry('authors/gone', { name: 5 }, Date.parse('2026-10-01T00:00:00Z'))]))).toMatchObject({ code: 'INVALID', message: 'Eintrag „authors/gone“ passt nicht zum Schema (1 Fehler, zuerst bei „name“). Nichts aus diesem Teil wurde gespeichert.' })
    expect((await entriesOf(s, s.site)).length).toBe(before)

    expect(await call([entry('authors/anna', { name: { de: 'Anna' } }), entry('authors/long', { name: { de: 'x'.repeat(5000) } }), entry('authors/longer', { name: { de: 'y'.repeat(6000) } })]))
      .toMatchObject({ entries: 3, warnings: 2, firstWarning: { id: 'authors/long', brick: 'authors', path: 'name.de', key: 'issues.tooLong' } })
    expect((await entriesOf(s, s.site)).length).toBe(before + 3)
  })

  // Wrong behaviour caught: an import stores Markdown trees past the guard the saves keep, and every public page fails.
  it('refuses live entries whose Markdown trees pass the site\'s guard', async () => {
    vi.stubEnv('GINKO_LOCAL', '1')
    const s = await setup()
    await s.t.run(async (ctx) => {
      const row = (await ctx.db.get(s.site))!
      const schema = row.schema as { bricks: Record<string, unknown> }
      schema.bricks.notes = { kind: 'collection', label, fields: { body: { type: 'markdown', label } } }
      await ctx.db.patch(s.site, { schema, treeBytes: 8 * 1024 * 1024 - 10 })
    })
    const before = (await entriesOf(s, s.site)).length
    const entry = (id: string, deletedAt?: number) => ({ id, brick: 'notes', kind: 'item' as const, order: 1, data: { body: { de: '## Hallo' } }, prints: {}, rev: 1, ...(deletedAt ? { deletedAt } : {}) })
    const call = (entries: unknown[]) => s.t.mutation(makeFunctionReference<'mutation'>('seed:importExport'), { site: 'restaurant', files: [], entries })
    // The trash keeps no trees.
    await expect(call([entry('notes/gone', Date.parse('2026-10-01T00:00:00Z'))])).resolves.toMatchObject({ entries: 1 })
    expect(await errorOf(call([entry('notes/live')]))).toMatchObject({ code: 'TOO_LARGE', message: 'Die Texte dieser Seite sind zu stark formatiert, um sie auszuliefern (z. B. sehr viele Überschriften oder Listenpunkte). Vereinfache diesen Text.' })
    expect((await entriesOf(s, s.site)).length).toBe(before + 1)
  })
})
