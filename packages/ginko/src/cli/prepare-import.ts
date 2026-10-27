// `ginko prepare-import <folder> --map <map.json>`: turns a folder in the export format (export.json and files/, filled
// by hand or by a script from an old site) into a folder that `ops:import` takes unchanged.
//   images      every http(s) address in an image field or a Markdown image is downloaded once per sha256, stored in
//               files/ and replaced by a `$file.<sha>` reference
//   components  old Markdown tags and attributes are renamed; tags the site does not know are reported
//   redirects   old paths become a `redirects.json` for `redirects` in ginko.config.ts
// export.json is rewritten in place after a backup (export.json.bak). A second run finds nothing left to do.
import { createHash } from 'node:crypto'
import { access, mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { isOpenRegistry, type ComponentRegistry } from '../core/components.ts'
import { imageInfo, limitOf, redirectProblems, routeUrls, serializeSchema, UPLOAD_TYPES, type Redirect } from '../core/index.ts'
import type { CollectionBrick, Field, Json, Schema } from '../core/types.ts'
import type { SiteInput } from '../core/index.ts'
import { CliError, isObject, parseExport, pathOf, type ExportFileInfo, type SiteExport } from './model.ts'

const TIMEOUT_MS = 20_000
// The platform's own upload table: an image it would refuse at import fails here, where the old address is still known.
const MAX_BYTES = limitOf('image')
const IMAGE_TYPES = new Set(Object.entries(UPLOAD_TYPES).filter(([, t]) => t.kind === 'image').map(([mime]) => mime))
const IMAGE_LABELS = Object.values(UPLOAD_TYPES).filter((t) => t.kind === 'image').map((t) => t.label).join(', ')

type ComponentRule = { tag: string; attributes: Record<string, string> }

export interface ImportMap {
  folder: string
  components: Record<string, ComponentRule>
  redirects: Record<string, string>
}

export interface PrepareInput {
  dir: string
  /** The parsed map file. */
  map: unknown
  /** The site's config; needed for redirects to entries and for the unknown-tag report. */
  config?: SiteInput
  fetch: (url: string, init?: RequestInit) => Promise<Response>
  log: (line: string) => void
}

export interface PrepareResult extends Record<string, unknown> {
  ok: boolean
  images: { downloaded: number; reused: number; failed: { url: string; reason: string }[] }
  components: { renamed: number; unknown: string[] }
  redirects: { count: number; file: string | null; problems: string[]; hint?: string }
}

/** Checks the map file's shape; every key is optional. */
export function parseMap(value: unknown): ImportMap {
  const bad = (what: string): never => { throw new CliError(`The map file is not valid: ${what}`, 'USAGE') }
  if (!isObject(value)) return bad('it must be a JSON object.')
  for (const key of Object.keys(value)) if (!['images', 'components', 'redirects'].includes(key)) bad(`unknown key “${key}”.`)
  const { images, components, redirects } = value
  if (images !== undefined && (!isObject(images) || (images.folder !== undefined && (typeof images.folder !== 'string' || !images.folder.trim())))) bad('“images.folder” must be a name.')
  const map: ImportMap = { folder: ((images as { folder?: string } | undefined)?.folder ?? 'imported').trim(), components: {}, redirects: {} }
  if (components !== undefined) {
    if (!isObject(components)) bad('“components” must be an object.')
    for (const [from, to] of Object.entries(components as Record<string, unknown>)) {
      if (typeof to === 'string' && to) map.components[from] = { tag: to, attributes: {} }
      else if (isObject(to) && typeof to.tag === 'string' && to.tag
        && (to.attributes === undefined || (isObject(to.attributes) && Object.values(to.attributes).every((a) => typeof a === 'string')))) {
        map.components[from] = { tag: to.tag, attributes: (to.attributes ?? {}) as Record<string, string> }
      } else bad(`“components.${from}” must be a tag name or { "tag", "attributes" }.`)
    }
  }
  if (redirects !== undefined) {
    if (!isObject(redirects) || !Object.values(redirects).every((t) => typeof t === 'string' && t)) bad('“redirects” must map an old path to a target.')
    map.redirects = redirects as Record<string, string>
  }
  return map
}

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const mimeOf = (response: Response) => (response.headers.get('content-type') ?? '').split(';')[0]!.trim().toLowerCase()

/** The name a downloaded image gets: the last part of its address, or its hash. */
function nameOf(url: string, sha: string, ext: string): string {
  try {
    const last = decodeURIComponent(new URL(url).pathname.split('/').filter(Boolean).pop() ?? '')
    if (last) return last
  } catch { /* the hash name below */ }
  return `${sha}${ext}`
}

const isUrl = (text: string) => /^https?:\/\//i.test(text)
/** `![alt](https://…)` with an optional title; group 3 is the address. */
const MARKDOWN_IMAGE = /(!\[[^\]]*\]\(\s*<?)(https?:\/\/[^\s)>]+)(>?(?:\s+"[^"]*")?\s*\))/g

/** The tag, its optional `[label]` and `{attributes}`; the colons before it say block (2), nested (3+) or inline (1). */
const TAG = /(?<![:\w])(:+)([A-Za-z][\w-]*)(?![\w-])(\[[^\]\n]*\])?(\{[^}\n]*\})?/g
const BLOCK_TAG = /^(:{2,})([A-Za-z][\w-]*)/gm
const INLINE_TAG = /(?<![:\w]):([A-Za-z][\w-]*)(?=[[{])/g

export async function prepareImport(input: PrepareInput): Promise<PrepareResult> {
  const { dir } = input
  const map = parseMap(input.map)
  const exportPath = join(dir, 'export.json')
  let original: string
  try {
    original = await readFile(exportPath, 'utf8')
  } catch {
    throw new CliError(`“${dir}” has no export.json. Is this a folder in the export format?`)
  }
  let parsed: unknown
  try { parsed = JSON.parse(original) } catch { throw new CliError('export.json is not valid JSON.') }
  const site: SiteExport = parseExport(parsed, 'path', 'export.json is not a valid export (format 1).')

  const exportSchema = site.schema
  const main = exportSchema.locales?.[0] ?? 'de'
  const files = new Map(site.files.map((f) => [f.id, f]))
  const folders = site.folders ?? (site.folders = [])
  const known = input.config?.components as ComponentRegistry | undefined
  const registry = input.config && !isOpenRegistry(known) ? known : undefined

  const result: PrepareResult = {
    ok: true,
    images: { downloaded: 0, reused: 0, failed: [] },
    components: { renamed: 0, unknown: [] },
    redirects: { count: 0, file: null, problems: [] },
  }
  const resolved = new Map<string, string>() // address → sha256
  const failed = new Map<string, string>()
  const unknown = new Set<string>()
  let changed = false

  function ensureFolder(name: string): string {
    const found = folders.find((f) => f.id === name)
    if (found) return found.id
    // Nested names (`a/b`) become nested folders, like the ids of `ginko files-export`.
    const parts = name.split('/').filter(Boolean)
    let id = ''
    for (const part of parts) {
      const parent = id || undefined
      id = parent ? `${parent}/${part}` : part
      if (!folders.some((f) => f.id === id)) { folders.push({ id, name: part, ...(parent ? { parent } : {}) }); changed = true }
    }
    return id
  }

  /** Downloads an image once; returns its sha256, or undefined after recording why it failed. */
  async function fetchImage(url: string): Promise<string | undefined> {
    const seen = resolved.get(url)
    if (seen) { result.images.reused++; return seen }
    if (failed.has(url)) return undefined
    const fail = (reason: string) => { failed.set(url, reason); result.images.failed.push({ url, reason }); input.log(`Image failed: ${url} (${reason})`); return undefined }
    let bytes: Uint8Array
    let mime: string
    try {
      const response = await input.fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) })
      if (!response.ok) return fail(`HTTP ${response.status}`)
      mime = mimeOf(response)
      if (!IMAGE_TYPES.has(mime)) return fail(`type “${mime || 'unknown'}” is not ${IMAGE_LABELS}`)
      const length = Number(response.headers.get('content-length'))
      if (length > MAX_BYTES) return fail(`larger than ${MAX_BYTES / 1024 / 1024} MB`)
      bytes = new Uint8Array(await response.arrayBuffer())
      if (bytes.byteLength > MAX_BYTES) return fail(`larger than ${MAX_BYTES / 1024 / 1024} MB`)
    } catch (error) {
      return fail(error instanceof Error ? (error.name === 'TimeoutError' ? 'timeout after 20 s' : error.message) : 'request failed')
    }
    const info = imageInfo(bytes)
    if (!info) return fail('not a readable image')
    const sha = createHash('sha256').update(bytes).digest('hex')
    resolved.set(url, sha)
    if (files.has(sha)) { result.images.reused++; return sha }
    const path = pathOf({ id: sha, mime })
    await mkdir(join(dir, 'files'), { recursive: true })
    await writeFile(join(dir, path), bytes)
    const file: ExportFileInfo & { path: string } = {
      id: sha, name: nameOf(url, sha, path.slice(path.lastIndexOf('.'))), mime, size: bytes.byteLength, width: info.width, height: info.height,
      sha256: sha, original: true, folder: ensureFolder(map.folder), path,
    }
    files.set(sha, file)
    site.files.push(file)
    result.images.downloaded++
    changed = true
    return sha
  }

  async function markdown(text: string): Promise<string> {
    // Images first: replace has no async form, so collect the addresses, fetch them, then substitute.
    const urls = [...text.matchAll(MARKDOWN_IMAGE)].map((m) => m[2]!)
    for (const url of new Set(urls)) await fetchImage(url)
    let out = text.replace(MARKDOWN_IMAGE, (whole, open: string, url: string, close: string) => {
      const sha = resolved.get(url)
      return sha ? `${open}$file.${sha}${close}` : whole
    })
    out = out.replace(TAG, (whole, colons: string, tag: string, label = '', attrs = '') => {
      const rule = Object.hasOwn(map.components, tag) ? map.components[tag] : undefined
      if (!rule) return whole
      result.components.renamed++
      let renamed = attrs
      for (const [from, to] of Object.entries(rule.attributes)) {
        renamed = renamed.replace(new RegExp(`(?<=[{\\s])${escape(from)}(?=[=\\s}])`, 'g'), to)
      }
      return `${colons}${rule.tag}${label}${renamed}`
    })
    if (registry) {
      for (const match of [...out.matchAll(BLOCK_TAG), ...out.matchAll(INLINE_TAG)]) {
        const tag = match[2] ?? match[1]!
        if (!Object.hasOwn(registry, tag)) unknown.add(tag)
      }
    }
    return out
  }

  /** The new value of one field value; the same value when nothing changes. */
  async function walk(field: Field, value: Json): Promise<Json> {
    if (field.type === 'image') {
      const object = isObject(value) ? value : undefined
      const url = typeof value === 'string' ? value : typeof object?.url === 'string' ? object.url : undefined
      if (url === undefined || !isUrl(url)) return value
      const sha = await fetchImage(url)
      if (!sha) return value
      const alt = object?.alt
      const { url: _url, alt: _alt, ...rest } = object ?? {}
      return { ...(rest as Record<string, Json>), file: sha, ...(typeof alt === 'string' && alt ? { alt: { [main]: alt } } : isObject(alt) ? { alt: alt as Json } : {}) }
    }
    if (field.type === 'markdown') {
      if (typeof value === 'string') return markdown(value)
      if (isObject(value)) {
        const out: Record<string, Json> = {}
        for (const [key, text] of Object.entries(value)) out[key] = typeof text === 'string' ? await markdown(text) : text as Json
        return out
      }
      return value
    }
    if (field.type === 'list' && Array.isArray(value)) {
      const rows: Json[] = []
      for (const row of value) {
        if (!isObject(row)) { rows.push(row); continue }
        const out: Record<string, Json> = { ...(row as Record<string, Json>) }
        for (const [name, column] of Object.entries(field.of)) if (name in out) out[name] = await walk(column, out[name]!)
        rows.push(out)
      }
      return rows
    }
    return value
  }

  for (const entry of site.entries) {
    const fields = exportSchema.bricks[entry.brick]?.fields
    if (!fields) continue
    for (const [name, field] of Object.entries(fields)) {
      if (!(name in entry.data)) continue
      const before = entry.data[name]!
      const after = await walk(field, before)
      if (JSON.stringify(after) !== JSON.stringify(before)) { entry.data[name] = after; changed = true }
    }
  }
  result.images.failed.sort((a, b) => a.url.localeCompare(b.url))
  result.components.unknown = [...unknown].sort()

  if (Object.keys(map.redirects).length > 0) await redirects(input, map, site, result)

  if (changed) {
    const next = `${JSON.stringify(site, null, 2)}\n`
    if (next !== original) {
      await writeFile(join(dir, 'export.json.bak'), original)
      await writeFile(exportPath, next)
    }
  }
  result.ok = result.images.failed.length === 0 && result.redirects.problems.length === 0
  return result
}

/** Turns the map's old paths into `redirects.json`. A `<brick>/<id>` target becomes the entry's address in the locale of the old path. */
async function redirects(input: PrepareInput, map: ImportMap, site: SiteExport, result: PrepareResult) {
  const problems = result.redirects.problems
  let schema: Schema | undefined
  if (input.config) schema = serializeSchema(input.config)
  const rules: Redirect[] = []
  for (const [from, target] of Object.entries(map.redirects)) {
    if (target.startsWith('/')) { rules.push({ from, to: target }); continue }
    const [brickKey, ...rest] = target.split('/')
    const id = rest.join('/')
    const entry = site.entries.find((e) => e.brick === brickKey && e.id === id && !e.deletedAt)
    if (!entry) { problems.push(`"${from}": no entry “${target}” in export.json.`); continue }
    if (!schema) { problems.push(`"${from}": a target “${target}” needs the site's routes. Pass --config <ginko.config.ts>.`); continue }
    const brick = schema.bricks[brickKey!]
    if (!brick || brick.kind !== 'collection' || !(brick as CollectionBrick).route) { problems.push(`"${from}": the brick “${brickKey}” has no route in the config.`); continue }
    const urls = routeUrls(schema, brick as CollectionBrick, { id: entry.id, data: entry.data })
    // An old path that starts with a language (`/en/old`) goes to that language's address, any other to the main language's.
    const locale = schema.locales.find((l) => from === `/${l}` || from.startsWith(`/${l}/`)) ?? schema.locales[0]!
    const to = urls[locale] ?? urls[schema.locales[0]!]
    if (!to) { problems.push(`"${from}": the entry “${target}” has no address (no slug).`); continue }
    rules.push({ from, to })
  }
  problems.push(...redirectProblems(rules))
  const good = rules.filter((r, i) => redirectProblems([r]).length === 0 && rules.findIndex((o) => o.from === r.from) === i)
  const file = join(input.dir, 'redirects.json')
  const text = `${JSON.stringify(good, null, 2)}\n`
  let current: string | undefined
  try { await access(file); current = await readFile(file, 'utf8') } catch { /* new file */ }
  if (current !== text) await writeFile(file, text)
  result.redirects.count = good.length
  result.redirects.file = file
  result.redirects.hint = 'Put the array in `redirects` in ginko.config.ts (defineSite).'
}
