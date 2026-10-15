// `pnpm local:import <dir>` and `pnpm ops:import <dir> --site <slug> --prod` (SPEC 9, 12, monorepo only): load a `ginko export`
// folder into the LOCAL platform, or (prod) into an EMPTY site of the hosted one. The caller has confirmed the target
// (connectLocal / connectProd); nothing here chooses it.
// Local steps: push the schema (devPush), store the files and the entry batches in storage, clear the site's content,
// import the stored batches, then rewrite the entry references (the entries got new IDs). Prod steps: no schema push and
// no clear; check that the stored schema has every brick, open the empty site for import, the same steps, close it again.
// `convex run` takes its arguments on the command line, whose size the OS limits, so the entries travel through
// storage; a batch stays under a mutation's limits.
import { readFile } from 'node:fs/promises'
import { join, resolve, sep } from 'node:path'
import { byteSize, entryBytes, markdownTrees, routeUrls, SITE_BUDGET, urlClashes, validate, type Msg, type Schema, type SchemaChange } from '../core/index.ts'
import type { Runner } from './local.ts'
import { CliError, isObject, parseExport, type ExportEntry, type SiteExport } from './model.ts'
import { english, explainRejected, kib } from './report.ts'

/**
 * Largest JSON size and entry count of one batch. One mutation writes it, within Convex's 1 s, also on a busy machine:
 * a batch holds two big entries (up to 480 KiB each) or 400 small ones, and answers with one ID pair per entry.
 */
export const BATCH_BYTES = 1_000_000
export const BATCH_ENTRIES = 400

export interface ImportInput {
  dir: string
  run: Runner
  /** Posts the bytes to a local upload URL and returns the storage ID the platform answers with. */
  upload: (url: string, bytes: Uint8Array<ArrayBuffer>, mime: string) => Promise<string>
  log: (line: string) => void
  /** Hosted platform: the schema must already be released, the site must be empty, nothing is cleared. Default: local. */
  prod?: boolean
  /** The site's slug on the platform. Default: the site of the export. */
  site?: string
  /** The command that repeats this import (e.g. `pnpm local:import <folder>`), named when a local import fails halfway. */
  again?: string
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

/** The IDs the export's entries are referenced by in other entries' data: only these need a new ID there. */
function referencedIds(entries: ExportEntry[], ids: Map<string, string>): { from: string; to: string }[] {
  const text = JSON.stringify(entries.map((e) => e.data))
  return [...ids].filter(([exported]) => text.includes(JSON.stringify(exported))).map(([from, to]) => ({ from, to }))
}

/** A catalog message read from the platform's JSON; parameters that are not text, numbers or messages are left out. */
function msgOf(value: Record<string, unknown>): Msg | undefined {
  if (typeof value.key !== 'string') return undefined
  if (!isObject(value.params)) return { key: value.key }
  const params: NonNullable<Msg['params']> = {}
  for (const [name, param] of Object.entries(value.params)) {
    const nested = isObject(param) ? msgOf(param) : undefined
    if (typeof param === 'string' || typeof param === 'number') params[name] = param
    else if (nested) params[name] = nested
  }
  return { key: value.key, params }
}

/** The platform's first import warning (seed.ts ImportWarning) as `<entry> <path>: <English message>`. */
function warningText(warning: Record<string, unknown>): string | undefined {
  const message = msgOf(warning)
  if (typeof warning.id !== 'string' || typeof warning.path !== 'string' || !message) return undefined
  return `${warning.id} ${warning.path}: ${english(message)}`
}

/** Largest size of the `ids` argument of one importRefs call (a command-line argument); more pairs go in further calls. */
const IDS_BYTES = 100_000

/** Length of a Convex document ID, which every referenced entry ID becomes in step 6. */
const NEW_ID = 'x'.repeat(32)

/**
 * What the platform's import (seed.ts importExport, importRefs) would refuse in an export, as English lines: values the
 * Studio cannot open at all, entries over the entry limit (removed ones too: a restore must be able to save them), and
 * live or removed entries over a site's budget, live Markdown trees over the guard the bundle needs; an entry ID twice,
 * a collection over its max, two entries with one address. Values that a save refuses only today are no problem: the platform stores
 * them and warns. The target site counts as empty: a local import clears it first, and the hosted import takes only an
 * empty site. Sizes count references to other entries with their new IDs: an ID from `ginko files-export` is a path like
 * `authors/anna`, shorter than the Convex ID that replaces it, so an entry with many references grows in step 6.
 */
export async function checkImport(schema: Schema, entries: ExportEntry[]): Promise<string[]> {
  const problems: string[] = []
  const exported = new Set(entries.map((e) => e.id))
  // Like referencedIds: any string value that names an exported entry (a text with exactly that value counts too, which only overestimates).
  const withNewIds = (data: unknown): unknown => JSON.parse(JSON.stringify(data ?? null, (_key, value: unknown) => typeof value === 'string' && exported.has(value) ? NEW_ID : value))
  let bytes = 0
  let trash = 0
  let trees = 0
  let live = 0
  const seen = new Set<string>()
  const liveIn = new Map<string, number>()
  for (const entry of entries) {
    if (seen.has(entry.id)) problems.push(`The entry “${entry.id}” appears twice.`)
    seen.add(entry.id)
    for (const issue of (await validate(schema, entry.brick, entry.data, { mode: 'restore' })).errors) {
      problems.push(`Entry ${entry.id} (${entry.brick}), ${issue.path || 'entry'}: ${english(issue)}`)
    }
    const size = entryBytes(withNewIds(entry.data), entry.prints)
    if (size > SITE_BUDGET.entryBytes) problems.push(`Entry ${entry.id} (${entry.brick}) is ${kib(size)}; the limit is ${kib(SITE_BUDGET.entryBytes)}.`)
    if (entry.deletedAt === undefined) {
      live++
      liveIn.set(entry.brick, (liveIn.get(entry.brick) ?? 0) + 1)
      bytes += size
      const fields = Object.hasOwn(schema.bricks, entry.brick) ? schema.bricks[entry.brick]!.fields : {}
      const tree = await markdownTrees(fields, entry.data)
      // As the platform stores them (treesOf): nothing for an entry without Markdown.
      if (Object.keys(tree).length > 0) trees += byteSize(tree)
    } else trash += size
  }
  for (const [brick, count] of liveIn) {
    const def = Object.hasOwn(schema.bricks, brick) ? schema.bricks[brick]! : undefined
    if (def?.kind === 'collection' && count > def.max) problems.push(`The collection “${brick}” has ${count} entries; it takes at most ${def.max}.`)
  }
  const addresses = entries.flatMap((entry) => {
    const def = Object.hasOwn(schema.bricks, entry.brick) ? schema.bricks[entry.brick]! : undefined
    return def?.kind === 'collection' ? [{ id: entry.id, urls: routeUrls(schema, def, { id: entry.id, order: entry.order, data: entry.data }) }] : []
  })
  for (const clash of urlClashes(addresses)) problems.push(`“${clash.first}” and “${clash.second}” have the same address ${clash.url}.`)
  if (live > SITE_BUDGET.entries) problems.push(`The export has ${live} entries; a site holds at most ${SITE_BUDGET.entries}.`)
  if (bytes > SITE_BUDGET.siteBytes) problems.push(`The export's entries take ${kib(bytes)}; a site holds at most ${kib(SITE_BUDGET.siteBytes)}.`)
  if (trash > SITE_BUDGET.trashBytes) problems.push(`The export's removed entries take ${kib(trash)}; the trash holds at most ${kib(SITE_BUDGET.trashBytes)}.`)
  if (trees > SITE_BUDGET.treeBytes) problems.push(`The export's Markdown texts have too much formatting to be delivered (${kib(trees)} of parsed text; at most ${kib(SITE_BUDGET.treeBytes)}). Simplify the most formatted texts.`)
  return problems
}

export async function importSite(input: ImportInput): Promise<{ entries: number; files: number }> {
  const { run, log } = input
  const data = await readExport(input.dir)
  const site = input.site ?? data.site
  // Before the schema push, the hosted site's opening and the clear: a refused import changes nothing.
  const problems = await checkImport(data.schema, data.entries)
  if (problems.length > 0) {
    throw new CliError(['The platform would refuse this export:', ...problems.map((p) => `  ✗ ${p}`), 'Nothing was imported. Fix these entries in export.json, then run the command again.'].join('\n'))
  }
  if (!input.prod) return importInto(input, data, site)

  // Hosted: the schema comes from `ginko release`, never from here.
  const status = await run('seed:importStatus', { site })
  if (!isObject(status) || !Array.isArray(status.bricks)) throw new CliError(`The site “${site}” does not exist on the platform. Create it (sites:bootstrap) and run \`ginko release\` first.`)
  const missing = Object.keys(data.schema.bricks).filter((brick) => !(status.bricks as unknown[]).includes(brick))
  if (missing.length > 0) throw new CliError(`The released schema of “${site}” has no ${missing.map((b) => `“${b}”`).join(', ')}. Run \`ginko release\` for the site first.`)
  await run('seed:importOpen', { site })
  log(`Site “${site}” is open for import.`)
  try {
    return await importInto(input, data, site)
  } finally {
    await run('seed:importDone', { site })
    log(`Site “${site}” is closed for import.`)
  }
}

async function importInto(input: ImportInput, data: SiteExport, site: string): Promise<{ entries: number; files: number }> {
  const { run, log } = input
  const limit = input.batchBytes ?? BATCH_BYTES

  // 1. Schema. Rejected changes go through as warnings, as in `local:dev` (SPEC 5.3).
  if (!input.prod) {
    const pushed = await run('release:devPush', { site, schema: data.schema })
    const warnings = isObject(pushed) && Array.isArray(pushed.warnings) ? (pushed.warnings as SchemaChange[]) : []
    for (const line of explainRejected(warnings)) log(`Warning: ${line}`)
    log(`Schema “${site}” pushed to the local platform.`)
  }

  // 2. Files first, so that a missing or broken file stops the import before anything is cleared.
  const stored = new Map<string, string>()
  for (const file of data.files) {
    const bytes = await readFileOf(input.dir, file)
    const url = await run('seed:uploadUrl', { site })
    if (typeof url !== 'string') throw new CliError('The local platform did not return an upload address.')
    stored.set(file.id, await input.upload(url, bytes, file.mime))
  }
  if (data.files.length) log(`${data.files.length} files in local storage.`)

  // 3. Entries in batches. A batch carries the files that its entries mention (found by their ID in the
  // entry's JSON, which may name a few too many, never too few); the platform stores each file once.
  const folders = data.folders ?? []
  const toFile = ({ id, name, mime, size, width, height, folder, kept, focus, sha256, original, alt }: SiteExport['files'][number]) => ({
    id, storageId: stored.get(id)!, name, mime, size,
    ...(width === undefined ? {} : { width }), ...(height === undefined ? {} : { height }),
    ...(folder === undefined ? {} : { folder }), ...(kept ? { kept: true } : {}),
    ...(focus === undefined ? {} : { focus }), ...(sha256 === undefined ? {} : { sha256 }),
    ...(original ? { original: true } : {}), ...(alt === undefined ? {} : { alt }),
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
    if (current.length >= BATCH_ENTRIES || (current.length > 0 && size([...current, entry]) > limit)) flush()
    current.push(entry)
  }
  flush()

  // Every batch is in storage before anything is cleared, so a failure leaves the local content as it was (Astra 9).
  const storedBatches: { id: string; count: number }[] = []
  for (const batch of batches) {
    const url = await run('seed:uploadUrl', { site })
    if (typeof url !== 'string') throw new CliError('The local platform did not return an upload address.')
    const bytes = new TextEncoder().encode(JSON.stringify(batch.args)) as Uint8Array<ArrayBuffer>
    storedBatches.push({ id: await input.upload(url, bytes, 'application/json'), count: batch.count })
  }

  if (input.prod) return fill(input, data, site, storedBatches)
  // From the clear on, a failure leaves the local site partly imported. After a passing problem, running the same
  // command again finishes it: it stores the batches again, clears what is left and imports everything.
  try {
    return await fill(input, data, site, storedBatches)
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    const again = passing(reason) ? `\nRun the same command again to finish${input.again ? `: ${input.again}` : '.'}` : ''
    throw new CliError(`${reason}\nThe local site is only partly imported.${again}`, error instanceof CliError ? error.code : undefined)
  }
}

/**
 * Whether a failed step may pass when it runs again: a time limit under load or a lost connection. A refusal of the
 * platform (a ConvexError) or of this command comes back on every run, so a second run cannot finish then.
 */
function passing(reason: string): boolean {
  return /timed out|transient|ECONNREFUSED|ECONNRESET|fetch failed|socket hang up/i.test(reason)
}

/** Steps 4 to 6: clear the local site, import the stored batches, rewrite the references between entries. */
async function fill(input: ImportInput, data: SiteExport, site: string, storedBatches: { id: string; count: number }[]): Promise<{ entries: number; files: number }> {
  const { run, log } = input

  // 4. Clear. Each call removes a bounded part. Never on the hosted platform: it is empty by rule.
  if (!input.prod) {
    for (;;) {
      const cleared = await run('seed:importClear', { site })
      if (isObject(cleared) && cleared.done === true) break
    }
  }

  // 5. Import the stored batches; each answers with the new ID of every entry, as [exported ID, new ID] pairs.
  let done = 0
  const ids = new Map<string, string>()
  let warnings = 0
  let firstWarning: string | undefined
  for (const batch of storedBatches) {
    const result = await run('seed:importBatch', { site, batch: batch.id })
    if (isObject(result) && Array.isArray(result.ids)) {
      for (const pair of result.ids as unknown[]) if (Array.isArray(pair) && typeof pair[0] === 'string' && typeof pair[1] === 'string') ids.set(pair[0], pair[1])
    }
    if (isObject(result) && typeof result.warnings === 'number') warnings += result.warnings
    if (isObject(result) && isObject(result.firstWarning)) firstWarning ??= warningText(result.firstWarning)
    done += batch.count
    log(`Entries: ${done}/${data.entries.length}`)
  }
  if (warnings > 0) {
    const first = firstWarning ? ` (first: ${firstWarning})` : ''
    log(`${warnings === 1 ? '1 entry holds' : `${warnings} entries hold`} values the Studio would refuse today${first}. They were imported as they were; fix them in the Studio.`)
  }
  // Originals (local:files-export) go through the upload pipeline after their batch; the bundle serves only ready files.
  if (data.files.some((file) => file.original)) log('Images are being processed; they appear on the site in a moment.')

  // 6. References between entries still name the exported IDs. Each part of the pairs goes once through all entries.
  const parts: { from: string; to: string }[][] = []
  let part: { from: string; to: string }[] = []
  let partBytes = 2
  for (const pair of referencedIds(data.entries, ids)) {
    const bytes = Buffer.byteLength(JSON.stringify(pair)) + 1
    if (part.length > 0 && partBytes + bytes > IDS_BYTES) { parts.push(part); part = []; partBytes = 2 }
    part.push(pair)
    partBytes += bytes
  }
  if (part.length > 0) parts.push(part)
  const changed = new Set<string>()
  for (const refs of parts) {
    let cursor: string | undefined
    for (;;) {
      const page = await run('seed:importRefs', { site, ids: refs, ...(cursor === undefined ? {} : { cursor }) })
      if (isObject(page) && Array.isArray(page.changed)) for (const id of page.changed) if (typeof id === 'string') changed.add(id)
      if (!isObject(page) || page.done === true) break
      if (typeof page.cursor !== 'string') throw new CliError('The platform did not return a cursor for the references.')
      cursor = page.cursor
    }
  }
  if (parts.length > 0) log(`References updated in ${changed.size} entries.`)
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
