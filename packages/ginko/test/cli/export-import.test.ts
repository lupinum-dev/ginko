import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { exportSite } from '../../src/cli/export.ts'
import { importSite } from '../../src/cli/import.ts'
import { failureOf, runOnce } from '../../src/cli/local.ts'
import type { ExportAnswer } from '../../src/cli/model.ts'
import type { Platform } from '../../src/cli/platform.ts'

interface Batch { site: string; files: Record<string, unknown>[]; folders?: unknown[]; entries: unknown[] }

const dirs: string[] = []
afterEach(async () => { await Promise.all(dirs.splice(0).map((d) => rm(d, { recursive: true, force: true }))) })
const tmp = async () => { const d = await mkdtemp(join(tmpdir(), 'ginko-ei-')); dirs.push(d); return d }

const answer = (files: ExportAnswer['files'], folders?: ExportAnswer['folders']): ExportAnswer => ({
  format: 1, site: 'linde', name: 'Linde',
  schema: { locales: ['de'], bricks: { page: { kind: 'single', label: 'Seite', fields: { image: { type: 'image', label: 'Bild' } } } } } as unknown as ExportAnswer['schema'],
  schemaRev: 1, contentRev: 1, exportedAt: '2026-10-11T00:00:00.000Z',
  entries: [{ id: 'e1', brick: 'page', kind: 'single', order: 0, data: { image: { file: 'up1', alt: { de: 'Linde' } } }, prints: {}, rev: 1 }],
  ...(folders ? { folders } : {}), files,
})

const bytes = new TextEncoder().encode('abcd')
const file = (id: string, extra = {}) => ({ id, name: `${id}.png`, mime: 'image/png', size: bytes.byteLength, url: `https://files.example/${id}`, ...extra })

/** Exports the answer to a folder, then imports it against a recording runner; returns the batches importExport would receive. */
async function roundTrip(data: ExportAnswer) {
  const dir = join(await tmp(), 'out')
  const platform = { exportSite: async () => data } as unknown as Platform
  await exportSite({ platform, site: 'linde', dir, fetch: async () => new Response(bytes), log: () => {} })
  const stored = new Map<string, Batch>()
  const imported: string[] = []
  const upload = async (_url: string, body: Uint8Array<ArrayBuffer>, mime: string) => {
    const id = `s${stored.size + 1}`
    if (mime === 'application/json') stored.set(id, JSON.parse(new TextDecoder().decode(body)) as Batch)
    return id
  }
  const run = async (fn: string, args: Record<string, unknown>) => {
    if (fn === 'seed:uploadUrl') return 'http://local/upload'
    if (fn === 'seed:importClear') return { done: true }
    if (fn === 'seed:importBatch') imported.push(args.batch as string)
    return {}
  }
  const logs: string[] = []
  await importSite({ dir, run, upload, log: (line) => logs.push(line) })
  return { dir, batches: imported.map((id) => stored.get(id)!), logs }
}

describe('export and import keep the asset library', () => {
  it('carries nested folders and the folder, kept and focus of a file that no entry uses', async () => {
    const folders = [{ id: 'f1', name: 'Fotos' }, { id: 'f2', name: 'Team', parent: 'f1' }]
    const { dir, batches } = await roundTrip(answer(
      [file('up1'), file('up2', { folder: 'f2', kept: true, focus: { x: 0.25, y: 0.75 }, sha256: 'abc' })],
      folders,
    ))
    const exported = JSON.parse(await readFile(join(dir, 'export.json'), 'utf8'))
    expect(exported.folders).toEqual(folders)
    expect(exported.files[1]).toMatchObject({ folder: 'f2', kept: true, focus: { x: 0.25, y: 0.75 }, sha256: 'abc' })

    expect(batches.flatMap((b) => b.files).find((f) => f.id === 'up2')).toMatchObject({ folder: 'f2', kept: true, focus: { x: 0.25, y: 0.75 }, sha256: 'abc' })
    for (const batch of batches) expect(batch.folders).toEqual(folders)
    expect(batches.flatMap((b) => b.entries)).toHaveLength(1)
  })

  it('still imports an export from before the library fields', async () => {
    const { dir, batches } = await roundTrip(answer([file('up1')]))
    expect(batches).toHaveLength(1)
    expect(batches[0]!.folders).toEqual([])
    expect(Object.keys(batches[0]!.files[0]!)).not.toEqual(expect.arrayContaining(['folder']))
    // An export.json written by an older CLI has no folders key at all.
    const old = JSON.parse(await readFile(join(dir, 'export.json'), 'utf8'))
    delete old.folders
    await writeFile(join(dir, 'export.json'), JSON.stringify(old))
    const run = async (fn: string) => (fn === 'seed:uploadUrl' ? 'http://local/upload' : { done: true })
    await expect(importSite({ dir, run, upload: async () => 's', log: () => {} })).resolves.toMatchObject({ files: 1 })
  })
})

describe('local:import', () => {
  // Wrong behaviour caught: every import prints a schema warning header with nothing under it, which reads like an error.
  it('prints no schema warning when the schema push has none', async () => {
    const { logs } = await roundTrip(answer([file('up1')]))
    expect(logs).toEqual(['Schema “linde” pushed to the local platform.', '1 files in local storage.', 'Entries: 1/1'])
  })
})

/** An answer with `count` small FAQ entries and no files. */
const faqs = (count: number): ExportAnswer => ({
  ...answer([]),
  schema: { locales: ['de'], bricks: { faq: { kind: 'collection', label: 'FAQ', max: 2000, fields: { question: { type: 'text', label: 'Frage' } } } } } as unknown as ExportAnswer['schema'],
  entries: Array.from({ length: count }, (_, i) => ({ id: `faq/q${i}`, brick: 'faq', kind: 'item' as const, order: i, data: { question: { de: `Frage ${i}` } }, prints: {}, rev: 1 })),
})

describe('local:import batches', () => {
  // Wrong behaviour caught: 1,000 small entries fit 1 MB, so a cut by bytes alone sends them in one call, which runs
  // past Convex's 1 s on a busy machine.
  it('cuts 1,000 small entries into batches of at most 400', async () => {
    const { batches } = await roundTrip(faqs(1000))
    expect(batches.map((b) => b.entries.length)).toEqual([400, 400, 200])
  })

  // Wrong behaviour caught: a refusal of the platform comes back on every run, yet the message says that a rerun finishes.
  it.each([
    { error: 'Function execution timed out (maximum duration: 1s)', hint: '\nRun the same command again to finish.' },
    { error: 'Uncaught ConvexError: {"code":"INVALID","message":"Der Eintrag „faq/q1“ kommt zweimal vor."}', hint: '' },
  ])('after “$error” says to run again only when that can finish', async ({ error, hint }) => {
    const dir = join(await tmp(), 'out')
    await exportSite({ platform: { exportSite: async () => faqs(1) } as unknown as Platform, site: 'linde', dir, fetch: async () => new Response(bytes), log: () => {} })
    const run = async (fn: string) => {
      if (fn === 'seed:importBatch') throw new Error(error)
      return fn === 'seed:uploadUrl' ? 'http://local/upload' : { done: true }
    }
    await expect(importSite({ dir, run, upload: async () => 's', log: () => {}, sleep: async () => {} })).rejects.toMatchObject({ message: `${error}\nThe local site is only partly imported.${hint}` })
  })

  // Wrong behaviour caught: on a busy machine Convex stops a function after 1 s. `convex run` prints the cause on its
  // third stderr line; the import read only the first ("Failed to run function"), took it for a refusal and stopped.
  it('tries again after Convex\'s time limit and finishes', async () => {
    const dir = join(await tmp(), 'out')
    await exportSite({ platform: { exportSite: async () => faqs(1) } as unknown as Platform, site: 'linde', dir, fetch: async () => new Response(bytes), log: () => {} })
    // The stderr of `convex run` after the time limit, as the Convex CLI prints it (colour codes included).
    const stderr = '\u001b[31m✖\u001b[39m Failed to run function "seed:importBatch":\n\u001b[31mError: [Request ID: 7071c5e5b2cd467c] Server Error\u001b[39m\n\u001b[31mFunction execution timed out (maximum duration: 1s)\u001b[39m\n'
    const timeout: unknown = await runOnce(process.execPath, ['-e', 'process.stderr.write(process.env.STDERR); process.exit(1)'], dir, { ...process.env, STDERR: stderr }).catch((error: unknown) => error)
    let failures = 1
    const run = async (fn: string) => {
      if (fn === 'seed:importBatch' && failures-- > 0) throw timeout
      return fn === 'seed:uploadUrl' ? 'http://local/upload' : { done: true }
    }
    const waits: number[] = []
    const done = await importSite({ dir, run, upload: async () => 's', log: () => {}, sleep: async (ms) => { waits.push(ms) } })
    expect(done.entries).toBe(1)
    expect(waits).toEqual([2_000])
  })

  // Wrong behaviour caught: the monorepo CLI logs its progress to stderr and its error last; a failed step reported its
  // first progress line ("Schema … pushed") as the reason, and the real error was lost.
  it('reports the end of stderr when it is not a Convex error', () => {
    expect(failureOf('Schema “events” pushed to the local platform.\nImporting 12 entries\nSite “linde” was not found.\n'))
      .toBe('Schema “events” pushed to the local platform. | Importing 12 entries | Site “linde” was not found.')
  })
})

describe('ops:import', () => {
  it('needs the literal --prod and a --site before it talks to any deployment', async () => {
    const { main } = await import('../../src/cli/monorepo.ts')
    const out: string[] = []
    const deps = { env: {}, git: async () => '', stdout: (t: string) => { out.push(t) }, log: () => undefined, fetch: async () => { throw new Error('no network') } }
    expect(await main(['ops:import', 'folder', '--site', 'lupinum'], deps)).toBe(2)
    expect(await main(['ops:import', 'folder', '--prod'], deps)).toBe(2)
    expect(out.join('')).toMatch(/Add --prod to confirm/)
    expect(out.join('')).toMatch(/needs --site/)
  })
})
