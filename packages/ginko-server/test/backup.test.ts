// Export, import and pull (SPEC 9, 12): GET /export, `ginko export` against it, and the import into a
// second backend. Two convex-test backends stand for production and the local platform.
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { makeFunctionReference } from 'convex/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { importSite } from '../../../packages/ginko/src/cli/import.ts'
import { main } from '../../../packages/ginko/src/cli/index.ts'
import { main as local } from '../../../packages/ginko/src/cli/monorepo.ts'
import { exportSite } from '../../../packages/ginko/src/cli/export.ts'
import type { Runner } from '../../../packages/ginko/src/cli/local.ts'
import { createPlatform } from '../../../packages/ginko/src/cli/platform.ts'
import type { SiteExport } from '../../../packages/ginko/src/cli/model.ts'
import { api, internal } from '../convex/_generated/api'
import type { Id } from '../convex/_generated/dataModel'
import { errorOf, setup } from './setup'

type Setup = Awaited<ReturnType<typeof setup>>

const PLATFORM = 'https://platform.test'
const STORAGE = 'https://some-deployment.convex.cloud/api/storage/'

const dirs: string[] = []
async function tempDir() {
  const dir = await mkdtemp(join(tmpdir(), 'ginko-backup-test-'))
  dirs.push(dir)
  return dir
}

afterEach(async () => {
  vi.unstubAllEnvs()
  for (const dir of dirs.splice(0)) await rm(dir, { recursive: true, force: true })
})

async function pushKey(s: Setup, scopes: ('release' | 'pull' | 'check' | 'export')[], who: 'owner' | 'stranger' = 'owner') {
  const site = who === 'owner' ? 'restaurant' : 'andere'
  return (await s.as[who].mutation(api.release.createPushKey, { site, label: 'Sicherung', scopes })).key
}

function getExport(s: Setup, key: string | undefined, site = 'restaurant') {
  return s.t.fetch(`/export?site=${site}`, { headers: key ? { authorization: `Bearer ${key}` } : {} })
}

/** A ready upload with real bytes in storage. A processed image keeps its original mime and has a WebP copy. */
async function readyUpload(s: Setup, opts: { name: string; mime: string; original: string; processed?: string; status?: 'ready' | 'processing' }) {
  return s.t.run(async (ctx) => {
    const storageId = await ctx.storage.store(new Blob([opts.original], { type: opts.mime }))
    const processedId = opts.processed === undefined ? undefined : await ctx.storage.store(new Blob([opts.processed], { type: 'image/webp' }))
    return ctx.db.insert('uploads', {
      site: s.site, uploader: 'u-wirtin', storageId, ...(processedId ? { processedId } : {}), name: opts.name,
      size: (opts.processed ?? opts.original).length, mime: opts.mime,
      ...(opts.processed === undefined ? {} : { width: 640, height: 480 }),
      status: opts.status ?? 'ready', attempts: 0,
    })
  })
}

/** Points an entry's data at uploads and keeps the file references in step, as a save does. */
async function setFiles(s: Setup, entry: Id<'entries'>, patch: Record<string, unknown>, files: Id<'uploads'>[]) {
  await s.t.run(async (ctx) => {
    const row = (await ctx.db.get(entry))!
    await ctx.db.patch(entry, { data: { ...(row.data as object), ...patch } })
    for (const file of files) await ctx.db.insert('fileRefs', { site: s.site, file, holder: 'entry', holderId: entry })
  })
}

/**
 * "Production": the corpus plus two images in the gallery (one of them also on an event), a deleted
 * menu entry, and uploads that must stay out of the export (unreferenced, still processing).
 */
async function production() {
  const s = await setup()
  const kitchen = await readyUpload(s, { name: 'kueche.jpg', mime: 'image/jpeg', original: 'original-jpeg-1', processed: 'webp-bytes-kitchen' })
  const dining = await readyUpload(s, { name: 'gastraum.png', mime: 'image/png', original: 'original-png-2', processed: 'webp-bytes-dining' })
  await readyUpload(s, { name: 'unbenutzt.pdf', mime: 'application/pdf', original: '%PDF-1.4 unbenutzt' })
  const pending = await readyUpload(s, { name: 'wartet.jpg', mime: 'image/jpeg', original: 'pending', status: 'processing' })

  await setFiles(s, s.entries.gallery!, {
    images: [
      { _id: 'galA', image: { file: kitchen, alt: { de: 'Küche', en: 'Kitchen' } } },
      { _id: 'galB', image: { file: dining, alt: { de: 'Gastraum' } } },
    ],
  }, [kitchen, dining])
  await setFiles(s, s.entries.weinabend!, { image: { file: kitchen, alt: { de: 'Küche beim Weinabend' } } }, [kitchen])
  await setFiles(s, s.entries.sommerfest!, { image: { file: pending, alt: { de: 'Noch nicht fertig' } } }, [pending])
  await s.t.run((ctx) => ctx.db.patch(s.entries['menu-saibling']!, { deletedAt: Date.parse('2026-10-07T12:00:00Z'), lifeRev: 2 }))
  return { s, kitchen, dining }
}

/** The fetch of the CLI: the platform's routes and the signed storage URLs of a backend. */
function fetchOf(s: Setup) {
  return async (input: string, init?: RequestInit) => {
    if (input.startsWith(STORAGE)) {
      // convex-test puts the file's SHA-256 into the URL where the real backend puts a signature.
      const sha = input.slice(STORAGE.length)
      const bytes = await s.t.run(async (ctx) => {
        const row = (await ctx.db.system.query('_storage').collect()).find((f) => f.sha256 === sha)
        return row ? (await ctx.storage.get(row._id))?.arrayBuffer() ?? null : null
      })
      return bytes ? new Response(bytes) : new Response(null, { status: 404 })
    }
    const { pathname, search } = new URL(input)
    return s.t.fetch(pathname + search, init)
  }
}

/** The local platform as the CLI sees it: functions by their `convex run` names, storage by upload. */
function localOf(s: Setup) {
  const calls: string[] = []
  const run: Runner = async (fn, args) => {
    calls.push(fn)
    // `convex run` runs both kinds; convex-test needs to know which one.
    return fn === 'seed:importBatch' ? s.t.action(makeFunctionReference<'action'>(fn), args) : s.t.mutation(makeFunctionReference<'mutation'>(fn), args)
  }
  const upload = (_url: string, bytes: Uint8Array, mime: string) => s.t.run((ctx) => ctx.storage.store(new Blob([bytes], { type: mime })))
  return { run, upload, calls }
}

async function exportOf(s: Setup, dir: string) {
  const key = await pushKey(s, ['export'])
  const platform = createPlatform({ url: PLATFORM, key, fetch: fetchOf(s) })
  return exportSite({ platform, site: 'restaurant', dir, fetch: (url) => fetchOf(s)(url), log: () => undefined })
}

describe('GET /export', () => {
  it('refuses a missing key, a key of another site and a key without scope export or pull', async () => {
    const { s } = await production()
    const stranger = await pushKey(s, ['export'], 'stranger')
    const releaseOnly = await pushKey(s, ['release', 'check'])
    const cases: [string, Response, number, string][] = [
      ['no key', await getExport(s, undefined), 401, 'UNAUTHORIZED'],
      ['key of another site', await getExport(s, stranger), 403, 'FORBIDDEN'],
      ['key without scope', await getExport(s, releaseOnly), 403, 'FORBIDDEN'],
    ]
    for (const [name, response, status, code] of cases) {
      expect([name, response.status, ((await response.json()) as { code: string }).code]).toEqual([name, status, code])
    }
    expect((await getExport(s, await pushKey(s, ['export']), 'andere')).status).toBe(403)
    expect((await s.t.fetch('/export', { headers: { authorization: `Bearer ${await pushKey(s, ['pull'])}` } })).status).toBe(400)
  })

  it('answers with every entry including deleted ones and with the ready files that entries use', async () => {
    const { s, kitchen, dining } = await production()
    const response = await getExport(s, await pushKey(s, ['pull']))
    expect(response.status).toBe(200)
    const body = (await response.json()) as {
      format: number; site: string; entries: { id: string; brick: string; deletedAt?: number; rev: number; prints: object }[]
      files: { id: string; name: string; mime: string; size: number; width?: number; url: string }[]
    }
    expect(body).toMatchObject({ format: 1, site: 'restaurant', name: 'Gasthaus zur Linde', schemaRev: 1, contentRev: 1 })
    const all = await s.t.run((ctx) => ctx.db.query('entries').collect())
    expect(body.entries).toHaveLength(all.length)
    expect(body.entries.find((e) => e.id === s.entries['menu-saibling'])).toMatchObject({ brick: 'menu', deletedAt: Date.parse('2026-10-07T12:00:00Z'), rev: 1 })
    expect(body.entries.find((e) => e.id === s.entries['menu-dal'])).not.toHaveProperty('deletedAt')
    // Unreferenced and unfinished uploads stay out; a processed image is described by its WebP copy.
    expect(body.files.map((f) => f.id).sort()).toEqual([kitchen, dining].sort())
    expect(body.files.find((f) => f.id === kitchen)).toMatchObject({ name: 'kueche.jpg', mime: 'image/webp', size: 'webp-bytes-kitchen'.length, width: 640 })
    expect(body.files.every((f) => f.url.startsWith(STORAGE))).toBe(true)
  })
})

describe('ginko export', () => {
  it('writes export.json and every file, prints one JSON line and never the key', async () => {
    const { s, kitchen, dining } = await production()
    const key = await pushKey(s, ['export'])
    const out = join(await tempDir(), 'backup')
    const stdout: string[] = []
    const logs: string[] = []
    const code = await main(['export', out], {
      env: { GINKO_PLATFORM: PLATFORM, GINKO_KEY: key }, git: async () => '', stdout: (t) => stdout.push(t), log: (l) => logs.push(l), fetch: fetchOf(s),
    })
    expect(code).toBe(0)
    expect(JSON.parse(stdout.join(''))).toEqual({ ok: true, dir: out, entries: expect.any(Number), files: 2 })
    expect(stdout.join('') + logs.join('\n')).not.toContain(key)

    const written = JSON.parse(await readFile(join(out, 'export.json'), 'utf8')) as SiteExport
    expect(written.entries).toHaveLength(JSON.parse(stdout.join('')).entries)
    expect(written.files.every((f) => !('url' in f))).toBe(true)
    expect(JSON.stringify(written)).not.toContain(STORAGE)
    expect(written.files.map((f) => f.path).sort()).toEqual([`files/${kitchen}.webp`, `files/${dining}.webp`].sort())
    expect(await readFile(join(out, `files/${kitchen}.webp`), 'utf8')).toBe('webp-bytes-kitchen')
    expect((await readdir(join(out, 'files'))).length).toBe(2)
  })

  it('refuses a folder that already holds something, before it asks the platform, and keeps its content', async () => {
    const { s } = await production()
    const key = await pushKey(s, ['export'])
    const out = await tempDir()
    await writeFile(join(out, 'wichtig.txt'), 'bleibt')
    const requests: string[] = []
    const logs: string[] = []
    expect(await main(['export', out], {
      env: { GINKO_PLATFORM: PLATFORM, GINKO_KEY: key }, git: async () => '', stdout: () => undefined, log: (l) => logs.push(l),
      fetch: async (input, init) => { requests.push(input); return fetchOf(s)(input, init) },
    })).toBe(2)
    expect(logs.join('\n')).toMatch(/is not empty/)
    expect(requests).toEqual([])
    expect(await readFile(join(out, 'wichtig.txt'), 'utf8')).toBe('bleibt')
  })

  it('stops on a file with the wrong number of bytes and leaves no folder that looks finished', async () => {
    const { s } = await production()
    const key = await pushKey(s, ['export'])
    const out = join(await tempDir(), 'backup')
    const cut = fetchOf(s)
    const logs: string[] = []
    expect(await main(['export', out], {
      env: { GINKO_PLATFORM: PLATFORM, GINKO_KEY: key }, git: async () => '', stdout: () => undefined, log: (l) => logs.push(l),
      fetch: async (input, init) => (input.startsWith(STORAGE) ? new Response('zu kurz') : cut(input, init)),
    })).toBe(3)
    expect(logs.join('\n')).toMatch(/is incomplete/)
    await expect(readdir(out)).rejects.toThrow()
  })
})

/** The bundle without what must differ between two backends: revisions, time, entry ids and file URLs. */
async function bundleOf(s: Setup, locale: string) {
  const bundle = (await (await s.t.fetch(`/bundle/restaurant?format=3&locale=${locale}`)).json()) as {
    schemaRev: number; contentRev: number; generatedAt: string; bricks: Record<string, { items?: { id?: string }[] }>
  }
  const { schemaRev: _a, contentRev: _b, generatedAt: _c, ...rest } = bundle
  for (const brick of Object.values(rest.bricks)) brick.items = brick.items?.map(({ id: _id, ...item }) => item)
  return JSON.parse(JSON.stringify(rest).replace(/https:\/\/some-deployment\.convex\.cloud\/api\/storage\/[a-z0-9]+/g, '<file>')) as unknown
}

describe('export → import round trip (SPEC 12)', () => {
  it('gives the imported site the same bundle, new ready uploads, deleted entries and exact counters', async () => {
    vi.stubEnv('GINKO_LOCAL', '1')
    const { s: prod } = await production()
    const local = await setup() // the plain corpus, without the gallery images and the deletion: import must replace it
    const dir = await tempDir()
    await exportOf(prod, dir)
    // An hour later: an imported entry keeps when it last changed, not the import time (the bundle's updatedAt).
    vi.setSystemTime(Date.now() + 3_600_000)

    const { run, upload, calls } = localOf(local)
    // A small batch size forces several importExport calls; the files and counters must survive that.
    const done = await importSite({ dir, run, upload, log: () => undefined, batchBytes: 4000 })
    expect(calls.filter((c) => c === 'seed:importBatch').length).toBeGreaterThan(1)
    // Every batch is stored before the local content is cleared (Astra 9).
    expect(calls.lastIndexOf('seed:uploadUrl')).toBeLessThan(calls.indexOf('seed:importClear'))
    // Imported files are already processed, so the editor can show them (uploads.urls needs processedId).
    const uploadRows = await local.t.run((ctx) => ctx.db.query('uploads').collect())
    expect(uploadRows.filter((u) => u.uploader === 'import').every((u) => u.processedId === u.storageId)).toBe(true)
    expect(done.files).toBe(2)

    for (const locale of ['de', 'en']) expect(await bundleOf(local, locale)).toEqual(await bundleOf(prod, locale))

    const rows = await local.t.run(async (ctx) => ({
      entries: await ctx.db.query('entries').collect(),
      uploads: await ctx.db.query('uploads').collect(),
      refs: await ctx.db.query('fileRefs').collect(),
      slugs: await ctx.db.query('slugs').collect(),
      site: (await ctx.db.get(local.site))!,
    }))
    // Image references point to new uploads of this backend that are ready, imported and referenced.
    const gallery = rows.entries.find((e) => e.brick === 'gallery')!
    const fileIds = (gallery.data as { images: { image: { file: string } }[] }).images.map((i) => i.image.file)
    expect(fileIds).toHaveLength(2)
    const imported = rows.uploads.filter((u) => u.uploader === 'import')
    expect(imported.map((u) => u._id).sort()).toEqual([...fileIds].sort())
    expect(imported.every((u) => u.status === 'ready' && u.site === local.site && u.width === 640)).toBe(true)
    // The bytes moved with them: the first image's upload serves the exported WebP copy from the local storage.
    const first = imported.find((u) => u._id === fileIds[0])!
    expect(await local.t.run(async (ctx) => (await ctx.storage.get(first.storageId))?.text())).toBe('webp-bytes-kitchen')
    expect(rows.refs.filter((r) => r.holder === 'entry').map((r) => r.file).sort()).toEqual([...fileIds, fileIds[0]].sort())

    // Deleted entries come back deleted; the addresses are rebuilt; counters count live entries only.
    const saibling = rows.entries.find((e) => e.brick === 'menu' && e.deletedAt !== undefined)!
    expect(saibling).toMatchObject({ deletedAt: Date.parse('2026-10-07T12:00:00Z'), rev: 1 })
    expect(rows.slugs.map((slug) => `${slug.brick}/${slug.locale}/${slug.slug}`).sort()).toEqual(
      (await prod.t.run((ctx) => ctx.db.query('slugs').collect())).map((slug) => `${slug.brick}/${slug.locale}/${slug.slug}`).sort(),
    )
    const prodRows = await prod.t.run((ctx) => ctx.db.query('entries').collect())
    expect(rows.entries).toHaveLength(prodRows.length)
    expect(rows.site.entryCount).toBe(rows.entries.filter((e) => !e.deletedAt).length)
    expect(rows.site.bytes).toBe(rows.entries.filter((e) => !e.deletedAt).reduce((sum, e) => sum + e.bytes, 0))
    expect(rows.site.trashBytes).toBe(rows.entries.filter((e) => e.deletedAt).reduce((sum, e) => sum + e.bytes, 0))
  })

  // Wrong behaviour caught: one clear call sizes its work by document count, so on a site with large entries it passes a
  // mutation's read limit, fails, and leaves the local site partly emptied.
  it('clears a site that is bigger than one call by bytes, and refuses everything outside GINKO_LOCAL=1', async () => {
    vi.stubEnv('GINKO_LOCAL', '1')
    const s = await setup()
    await s.t.run(async (ctx) => {
      const template = (await ctx.db.get(s.entries['menu-dal']!))!
      const { _id: _i, _creationTime: _t, ...row } = template
      // 24 entries of 200,000 characters: about 4.8 MB, far fewer documents than one call took before.
      for (let i = 0; i < 24; i++) await ctx.db.insert('entries', { ...row, order: 100 + i, data: { ...(row.data as object), description: { de: 'x'.repeat(200_000) } } })
    })
    const clear = makeFunctionReference<'mutation'>('seed:importClear')
    const answers = []
    do answers.push(await s.t.mutation(clear, { site: 'restaurant' }) as { done: boolean })
    while (!answers.at(-1)!.done)
    expect(answers.length).toBeGreaterThan(1)
    expect(await s.t.run((ctx) => ctx.db.query('entries').collect())).toHaveLength(0)
    expect(await s.t.run((ctx) => ctx.db.get(s.site))).toMatchObject({ entryCount: 0, bytes: 0, contentRev: 2 })

    vi.stubEnv('GINKO_LOCAL', '')
    const keep = await setup()
    for (const [fn, args] of [['seed:importClear', { site: 'restaurant' }], ['seed:uploadUrl', { site: 'restaurant' }], ['seed:importExport', { site: 'restaurant', files: [], entries: [] }]] as const) {
      expect([fn, (await errorOf(keep.t.mutation(makeFunctionReference<'mutation'>(fn), args))).code]).toEqual([fn, 'FORBIDDEN'])
    }
    expect(await keep.t.run((ctx) => ctx.db.query('entries').collect())).not.toHaveLength(0)
  })
})

describe('import budget (SPEC 3)', () => {
  // Wrong behaviour caught: an import stores entries over the entry limit (the Studio then cannot save them), and the
  // CLI clears the local site before the platform refuses anything, so a refused import leaves it half-imported.
  it('an export entry over the entry limit is refused with every problem, and nothing is stored or cleared', async () => {
    vi.stubEnv('GINKO_LOCAL', '1')
    const s = await setup()
    const notice = (id: string, text: string) => ({ id, brick: 'notices', kind: 'item' as const, order: 1, data: { text: { de: text } }, prints: {}, rev: 1 })
    const entries = [notice('e1', 'x'.repeat(500 * 1024)), notice('e2', 'kurz'), notice('e3', 'y'.repeat(600 * 1024))]
    const before = await s.t.run((ctx) => ctx.db.query('entries').collect())

    const refused = await errorOf(s.t.mutation(internal.seed.importExport, { site: 'restaurant', files: [], entries }))
    expect(refused).toMatchObject({ code: 'TOO_LARGE', message: 'Eintrag „e1“ ist zu groß (500 KB, höchstens 480 KB).' })
    expect(refused.details).toMatchObject({ problems: [{ message: 'Eintrag „e1“ ist zu groß (500 KB, höchstens 480 KB).' }, { message: 'Eintrag „e3“ ist zu groß (600 KB, höchstens 480 KB).' }] })

    const dir = await tempDir()
    const schema = (await s.t.run((ctx) => ctx.db.get(s.site)))!.schema
    await writeFile(join(dir, 'export.json'), JSON.stringify({
      format: 1, site: 'restaurant', name: 'Linde', schema, schemaRev: 1, contentRev: 1, exportedAt: '2026-10-14T00:00:00.000Z', entries, files: [],
    }))
    const { run, upload, calls } = localOf(s)
    await expect(importSite({ dir, run, upload, log: () => undefined })).rejects.toThrow([
      'The platform would refuse this export:',
      '  ✗ Entry e1 (notices) is 501 KiB; the limit is 480 KiB.',
      '  ✗ Entry e3 (notices) is 601 KiB; the limit is 480 KiB.',
      'Nothing was imported. Fix these entries in export.json, then run the command again.',
    ].join('\n'))
    expect(calls).toEqual([])
    expect(await s.t.run((ctx) => ctx.db.query('entries').collect())).toEqual(before)
  })
})

describe('local:import and local:pull refuse a target that is not the local backend', () => {
  it('stops before it reads the folder, asks the platform or runs anything', async () => {
    const { s } = await production()
    const key = await pushKey(s, ['pull'])
    vi.stubEnv('CONVEX_DEPLOYMENT', 'prod:happy-animal-123')
    const requests: string[] = []
    const logs: string[] = []
    const deps = {
      env: { GINKO_PLATFORM: PLATFORM, GINKO_KEY: key }, git: async () => '', stdout: () => undefined, log: (l: string) => logs.push(l),
      fetch: async (input: string, init?: RequestInit) => { requests.push(input); return fetchOf(s)(input, init) },
    }
    const missing = join(await tempDir(), 'gibt-es-nicht')
    expect(await local(['import', missing], deps)).toBe(2)
    expect(await local(['pull'], deps)).toBe(2)
    expect(logs).toEqual([expect.stringMatching(/local:import stopped.*not the local backend/), expect.stringMatching(/local:pull stopped.*not the local backend/)])
    expect(requests).toEqual([])
  })
})
