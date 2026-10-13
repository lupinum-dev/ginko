// `pnpm local:import <dir>` (SPEC 9, 12, monorepo only): loads a `ginko export` folder into the LOCAL platform. The caller
// has confirmed the local deployment (connectLocal); nothing here talks to production.
// Steps: push the schema (devPush), store the files and the entry batches in local storage, clear the
// site's content, then import the stored batches. `convex run` takes its arguments on the command line,
// whose size the OS limits, so the entries travel through storage; a batch stays under a mutation's limits.
import { readFile } from 'node:fs/promises'
import { join, resolve, sep } from 'node:path'
import type { SchemaChange } from '../core/index.ts'
import type { Runner } from './local.ts'
import { CliError, isObject, parseExport, type ExportEntry, type SiteExport } from './model.ts'
import { explainRejected } from './report.ts'

/** Largest JSON size of one batch: one mutation writes it, and entries may have up to 256 KiB each. */
export const BATCH_BYTES = 2_000_000

export interface ImportInput {
  dir: string
  run: Runner
  /** Posts the bytes to a local upload URL and returns the storage ID the platform answers with. */
  upload: (url: string, bytes: Uint8Array<ArrayBuffer>, mime: string) => Promise<string>
  log: (line: string) => void
  /** Largest size of one call's arguments. Default BATCH_BYTES; tests lower it to get several batches. */
  batchBytes?: number
}

async function readExport(dir: string): Promise<SiteExport> {
  let text: string
  try {
    text = await readFile(join(dir, 'export.json'), 'utf8')
  } catch {
    throw new CliError(`“${dir}” has no export.json. Is this a folder from \`ginko export\`?`)
  }
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    throw new CliError('export.json is not valid JSON.')
  }
  return parseExport(value, 'path', 'export.json is not a valid export (format 1).')
}

/** Reads one file of the export and checks it against the size in export.json. */
async function readFileOf(dir: string, file: SiteExport['files'][number]): Promise<Uint8Array<ArrayBuffer>> {
  const root = resolve(dir)
  const full = resolve(root, file.path)
  if (!full.startsWith(root + sep)) throw new CliError(`The path “${file.path}” is outside the export folder.`)
  let bytes: Uint8Array<ArrayBuffer>
  try {
    bytes = await readFile(full)
  } catch {
    throw new CliError(`The file “${file.path}” is missing from the export folder.`)
  }
  if (bytes.byteLength !== file.size) throw new CliError(`The file “${file.path}” is damaged: ${bytes.byteLength} instead of ${file.size} bytes.`)
  return bytes
}

export async function importSite(input: ImportInput): Promise<{ entries: number; files: number }> {
  const { run, log } = input
  const limit = input.batchBytes ?? BATCH_BYTES
  const data = await readExport(input.dir)
  const site = data.site

  // 1. Schema. Rejected changes go through as warnings, as in `local:dev` (SPEC 5.3).
  const pushed = await run('release:devPush', { site, schema: data.schema })
  const warnings = isObject(pushed) && Array.isArray(pushed.warnings) ? (pushed.warnings as SchemaChange[]) : []
  for (const line of explainRejected(warnings)) log(`Warning: ${line}`)
  log(`Schema “${site}” pushed to the local platform.`)

  // 2. Files first, so that a missing or broken file stops the import before anything is cleared.
  const stored = new Map<string, string>()
  for (const file of data.files) {
    const bytes = await readFileOf(input.dir, file)
    const url = await run('seed:uploadUrl', {})
    if (typeof url !== 'string') throw new CliError('The local platform did not return an upload address.')
    stored.set(file.id, await input.upload(url, bytes, file.mime))
  }
  if (data.files.length) log(`${data.files.length} files in local storage.`)

  // 3. Entries in batches. A batch carries the files that its entries mention (found by their ID in the
  // entry's JSON, which may name a few too many, never too few); the platform stores each file once.
  const folders = data.folders ?? []
  const toFile = ({ id, name, mime, size, width, height, folder, kept, focus, sha256 }: SiteExport['files'][number]) => ({
    id, storageId: stored.get(id)!, name, mime, size,
    ...(width === undefined ? {} : { width }), ...(height === undefined ? {} : { height }),
    ...(folder === undefined ? {} : { folder }), ...(kept ? { kept: true } : {}),
    ...(focus === undefined ? {} : { focus }), ...(sha256 === undefined ? {} : { sha256 }),
  })
  // Every call carries all folders (a few rows; the platform matches them by name and parent).
  const toArgs = (entries: ExportEntry[]) => {
    const text = JSON.stringify(entries.map((e) => e.data))
    return { site, files: data.files.filter((file) => text.includes(file.id)).map(toFile), folders, entries }
  }
  const size = (entries: ExportEntry[]) => Buffer.byteLength(JSON.stringify(toArgs(entries)))
  const batches: { args: ReturnType<typeof toArgs>; count: number }[] = []

  // Library files that no entry mentions (kept or in a folder) and the folders themselves go in a first batch without entries.
  const allText = JSON.stringify(data.entries.map((e) => e.data))
  const library = data.files.filter((file) => !allText.includes(file.id) && (file.kept || file.folder !== undefined))
  if (library.length > 0 || folders.length > 0) batches.push({ args: { site, files: library.map(toFile), folders, entries: [] }, count: 0 })

  let current: ExportEntry[] = []
  const flush = () => { if (current.length > 0) batches.push({ args: toArgs(current), count: current.length }); current = [] }
  for (const entry of data.entries) {
    if (current.length > 0 && size([...current, entry]) > limit) flush()
    current.push(entry)
  }
  flush()

  // Every batch is in storage before anything is cleared, so a failure leaves the local content as it was (Astra 9).
  const storedBatches: { id: string; count: number }[] = []
  for (const batch of batches) {
    const url = await run('seed:uploadUrl', {})
    if (typeof url !== 'string') throw new CliError('The local platform did not return an upload address.')
    const bytes = new TextEncoder().encode(JSON.stringify(batch.args)) as Uint8Array<ArrayBuffer>
    storedBatches.push({ id: await input.upload(url, bytes, 'application/json'), count: batch.count })
  }

  // 4. Clear. Each call removes a bounded part.
  for (;;) {
    const cleared = await run('seed:importClear', { site })
    if (isObject(cleared) && cleared.done === true) break
  }

  // 5. Import the stored batches.
  let done = 0
  for (const batch of storedBatches) {
    await run('seed:importBatch', { site, batch: batch.id })
    done += batch.count
    log(`Entries: ${done}/${data.entries.length}`)
  }
  return { entries: data.entries.length, files: data.files.length }
}

/** Posts a file to a local Convex upload URL and returns the storage ID. */
export async function postFile(fetchFn: (url: string, init?: RequestInit) => Promise<Response>, url: string, bytes: Uint8Array<ArrayBuffer>, mime: string): Promise<string> {
  let response: Response
  try {
    response = await fetchFn(url, { method: 'POST', headers: { 'content-type': mime }, body: new Blob([bytes], { type: mime }) })
  } catch {
    throw new CliError('Local storage is not reachable.')
  }
  if (!response.ok) throw new CliError(`Local storage rejected the file (HTTP ${response.status}).`)
  const body: unknown = await response.json()
  if (!isObject(body) || typeof body.storageId !== 'string') throw new CliError('Local storage did not return a file ID.')
  return body.storageId
}
