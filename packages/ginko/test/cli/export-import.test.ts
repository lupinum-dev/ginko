import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { exportSite } from '../../src/cli/export.ts'
import { importSite } from '../../src/cli/import.ts'
import type { ExportAnswer } from '../../src/cli/model.ts'
import type { Platform } from '../../src/cli/platform.ts'

interface Batch { site: string; files: Record<string, unknown>[]; folders?: unknown[]; entries: unknown[] }

const dirs: string[] = []
afterEach(async () => { await Promise.all(dirs.splice(0).map((d) => rm(d, { recursive: true, force: true }))) })
const tmp = async () => { const d = await mkdtemp(join(tmpdir(), 'ginko-ei-')); dirs.push(d); return d }

const answer = (files: ExportAnswer['files'], folders?: ExportAnswer['folders']): ExportAnswer => ({
  format: 1, site: 'linde', name: 'Linde', schema: { bricks: {} } as unknown as ExportAnswer['schema'],
  schemaRev: 1, contentRev: 1, exportedAt: '2026-10-11T00:00:00.000Z',
  entries: [{ id: 'e1', brick: 'page', kind: 'single', order: 0, data: { image: 'up1' }, prints: {}, rev: 1 }],
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
  await importSite({ dir, run, upload, log: () => {} })
  return { dir, batches: imported.map((id) => stored.get(id)!) }
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
