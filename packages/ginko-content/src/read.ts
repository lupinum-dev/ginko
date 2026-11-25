import { statSync } from 'node:fs'
import { readdir, readFile } from 'node:fs/promises'
import { basename, join, resolve, sep } from 'node:path'
import type {
  Brick, Field, Fields, Json, Locale, MarkdownTree,
} from '@lupinum/ginko'
import {
  changeIssues, coreMessage, dataOn, effectiveProfile, ENTRY_NAME_RULE, waitingChanges, type Change, imageInfo, imageSizeProps, isEntryName, isTranslatable, printOf, sha256, slugKeyOf, routeUrls, wallClockIn, urlClashes, validate, isDate, type FileInfo, type Schema, type StoredEntry,
} from '@lupinum/ginko/internal'
import { load as loadYaml } from 'js-yaml'
import { cellValue, parseCsv, type CsvRow } from './csv.ts'
import { head, renameInText, rewriteImages } from './images.ts'
import { fileTimes } from './git.ts'
import { parseFile } from './markdown.ts'

export interface ContentError {
  /** Path relative to the content directory, e.g. `docs/1.einstieg.en.md`. */
  file: string
  /** Field path as in validate() issues, when the error belongs to one field. */
  path?: string
  /** The place as the owner reads it (`exceptions, row 3, closed`), when it differs from `path` (row ids, 0-based indexes). */
  display?: string
  message: string
  /** 1-based line in the file, when the error belongs to one (YAML, JSON and CSV parse errors, CSV rows). */
  line?: number
}

/**
 * One error as `ginko check` and the build print it: `content/<file>:<line> (<field>): <message>`.
 * @internal Loaded by the Ginko module and CLI; sites do not import it.
 */
export function errorLine(e: ContentError): string {
  return `content/${e.file}${e.line !== undefined ? `:${e.line}` : ''}${(e.display ?? e.path) ? ` (${e.display ?? e.path})` : ''}: ${e.message}`
}

export interface ReadOptions {
  /**
   * `false` leaves out entries marked `$draft: true`, and entries whose `$publishAt` is still to come (those are
   * checked in full first). Default `true` (dev shows both).
   */
  drafts?: boolean
  /** The time counted as "now": for `$publishAt` (on the site's wall clock) and, in a build, the visibility windows and `generatedAt`. Default: the current time. */
  now?: Date
  /** `text` keeps each Markdown field as its source text, the form the platform stores and the Studio edits
   * (`pnpm local:files-export`). Default `tree`: the parsed tree the site's bundle carries. */
  markdown?: 'tree' | 'text'
}

export interface ReadResult {
  /** Stored-format entries per file brick, ready for buildBundle. */
  entries: Record<string, StoredEntry[]>
  /** Images and files referenced from frontmatter, by their path under `public/` (the stored `file` id). */
  files: Record<string, FileInfo>
  /** Images placed next to Markdown files: served URL (`/_ginko/img/<hash>.<ext>`) to absolute path. */
  images: Map<string, string>
  errors: ContentError[]
  /** Problems that do not stop a build but should be fixed, such as a dated change whose day has come (D122). */
  warnings: ContentError[]
  /** Things worth a look that do not stop a build, such as a `publishedOn` date that does not fit the entry's `$publishAt`. */
  notes: ContentError[]
}

type Prints = Record<string, Partial<Record<Locale, string>>>
type View = Record<string, unknown>

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const extensions = ['md', 'yml', 'yaml', 'json', 'csv'] as const
const extOf = (file: string) => file.slice(file.lastIndexOf('.') + 1)

/** `1.einstieg.en.md` → order 1, name `einstieg`, locale `en`. Numbers and locales are optional; the extension is any of `extensions`. */
function parseFileName(file: string): { name: string; number?: number; locale?: string } {
  const stem = file.slice(0, file.lastIndexOf('.'))
  const numbered = /^(\d+)\.(.+)$/.exec(stem)
  const rest = numbered ? numbered[2]! : stem
  const dot = rest.lastIndexOf('.')
  if (dot < 0) return { name: rest, number: numbered ? Number(numbered[1]) : undefined }
  return { name: rest.slice(0, dot), number: numbered ? Number(numbered[1]) : undefined, locale: rest.slice(dot + 1) }
}

/** Stable row id from the entry id and the row index (CONTENT.md: `r` + 9 chars of sha256). */
const rowId = (entryId: string, index: number) => `r${sha256(`${entryId}:${index}`).slice(0, 9)}`

/** Per-file context for converting frontmatter: errors go to this file. */
interface FileCx {
  file: string
  isMain: boolean
  prefix: string
  publicDir: string
  files: Record<string, FileInfo>
  errors: ContentError[]
  line?: number
  /** Where a list row sits in the file, for the owner: `['steps', 'row 2']`. */
  where: string[]
}

/** The place of `path` for the owner: the row parents from `where`, then the rest of the path. */
const displayOf = (where: string[], prefix: string, path: string) => [...where, path.slice(prefix.length)].join(', ')

function fail(cx: FileCx, path: string, message: string) {
  const display = cx.where.length > 0 ? displayOf(cx.where, cx.prefix, path) : undefined
  cx.errors.push({ file: cx.file, path, ...(display !== undefined && display !== path ? { display } : {}), message, ...(cx.line !== undefined ? { line: cx.line } : {}) })
}

/**
 * The keys of a content file that are no fields: they start with `$`, and a field name never does (V2 5.6). A key
 * that starts with `$` and is not one of these is a problem.
 */
const DOLLAR_KEYS = ['$draft', '$publishAt', '$redirectFrom', '$changes'] as const
/** Keys that were reserved before the `$` keys, with the key that replaced each. */
const RENAMED: Record<string, string> = {
  draft: '`$draft: true`',
  redirectFrom: '`$redirectFrom: /old-path`',
}

/**
 * Splits a file's data into the fields of the brick and the `$` keys. A `$` key Ginko does not know, and a key that
 * was reserved before (`draft`, `redirectFrom`) on a brick without a field of that name, are problems, and so is a
 * `$` key in a translation file; the key is then left out.
 */
function splitKeys(cx: FileCx, fields: Fields, data: Record<string, unknown>): { fields: Record<string, unknown>; dollar: Partial<Record<(typeof DOLLAR_KEYS)[number], unknown>> } {
  const own: Record<string, unknown> = {}
  const dollar: Partial<Record<(typeof DOLLAR_KEYS)[number], unknown>> = {}
  for (const [key, value] of Object.entries(data)) {
    if (key.startsWith('$')) {
      const known = DOLLAR_KEYS.find((k) => k === key)
      // They hold one state for all languages, so only the main-language file states them.
      if (known && !cx.isMain) fail(cx, key, `“${key}” belongs in the main-language file.`)
      else if (known) dollar[known] = value
      else fail(cx, key, `“${key}” is not a key Ginko knows. Keys that start with $ are ${DOLLAR_KEYS.join(', ')}; every other key is a field of the brick.`)
    } else if (Object.hasOwn(RENAMED, key) && !Object.hasOwn(fields, key)) {
      fail(cx, key, `“${key}” is no field of this brick. Write ${RENAMED[key]}: keys that are no fields start with $.`)
    } else own[key] = value
  }
  return { fields: own, dollar }
}

/**
 * `$publishAt`: the day (`2026-12-01`, meaning 00:00) or day and time (`2026-12-01T09:00`) the entry goes online, on
 * the wall clock of the site's time zone, as `YYYY-MM-DDTHH:MM`. No offset and no seconds: one written form.
 */
function publishTime(cx: FileCx, value: unknown): string | undefined {
  const match = typeof value === 'string' ? /^(\d{4}-\d{2}-\d{2})(?:T(\d{2}):(\d{2}))?$/.exec(value) : null
  if (match && isDate(match[1]) && Number(match[2] ?? 0) < 24 && Number(match[3] ?? 0) < 60) return `${match[1]}T${match[2] ?? '00'}:${match[3] ?? '00'}`
  fail(cx, '$publishAt', '“$publishAt” must be a day or a day and time in the site\'s time zone, such as 2026-12-01 or 2026-12-01T09:00 (no offset, no seconds).')
  return undefined
}

/** `$redirectFrom`: one old path or a list of them, each starting with `/`. */
function redirectPaths(cx: FileCx, value: unknown): string[] | undefined {
  const list = Array.isArray(value) ? value : [value]
  if (!list.every((p): p is string => typeof p === 'string' && p.startsWith('/') && !p.startsWith('//'))) {
    fail(cx, '$redirectFrom', '“$redirectFrom” must be a path or a list of paths, each starting with “/”.')
    return undefined
  }
  return list
}

/** One entry's source: a file, or one row of a CSV file. */
interface Src {
  rel: string
  path: string
  /** The entry name: file name without number, locale and extension, or the CSV `slug` cell. */
  name: string
  csv?: { columns: string[]; row: CsvRow }
}

/** 1-based line of a character offset. */
const lineAt = (text: string, offset: number) => text.slice(0, offset).split('\n').length

/**
 * Offset of the first character JSON.parse cannot accept. Node reports it in the message only for some errors, so
 * otherwise the offset is searched: a prefix that is merely unfinished fails with "end of input" or "Unterminated",
 * the first prefix that fails differently ends at the bad character.
 */
function jsonErrorOffset(text: string, reason: string): number {
  const position = /position (\d+)/.exec(reason)
  if (position && !/Unterminated/.test(reason)) return Number(position[1])
  const unfinished = (prefix: string) => {
    try { JSON.parse(prefix); return true } catch (e) { return /end of JSON input|Unterminated|Unexpected end/.test(String(e)) }
  }
  let low = 0
  let high = text.length
  while (low < high) {
    const mid = (low + high) >> 1
    if (unfinished(text.slice(0, mid + 1))) low = mid + 1
    else high = mid
  }
  return low
}

/** True for the error js-yaml throws on a syntax error (`reason` and `mark` say what and where). */
const isYamlError = (error: unknown): error is Error & { reason?: string; mark?: { line?: number } } =>
  error instanceof Error && error.name === 'YAMLException'

/**
 * A YAML syntax error as the owner needs it: the file, the line in the file and what to do. `lineShift` is the number of
 * file lines before the YAML (1 for the `---` line of Markdown frontmatter). An unquoted colon inside a value is the
 * common slip, so the mapping error says to quote the text.
 */
function yamlError(error: unknown, text: string, file: string, lineShift: number): ContentError {
  const { reason, mark } = error as { reason?: string; mark?: { line?: number } }
  const why = reason ?? (error instanceof Error ? error.message : String(error)).split('\n')[0]!
  const line = typeof mark?.line === 'number' ? mark.line + 1 + lineShift : undefined
  let hint = ''
  if (why.startsWith('bad indentation of a mapping entry')) {
    const slip = line === undefined ? null : /^\s*([^:\s][^:]*):\s+([^:]*:)\s/.exec(text.split('\n')[line - 1] ?? '')
    hint = slip ? ` Put text with a colon in quotes: ${slip[1]}: "${slip[2]} …"` : ' Put text with a colon in quotes.'
  }
  return { file, message: `Invalid YAML: ${why}.${hint}`, ...(line !== undefined ? { line } : {}) }
}

/** The raw key/value data of a YAML or JSON file; errors carry the line of the syntax error. */
function parseDataFile(text: string, ext: string, rel: string, errors: ContentError[]): Record<string, unknown> | undefined {
  let data: unknown
  try {
    data = ext === 'json' ? JSON.parse(text) : loadYaml(text)
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    if (ext === 'json') {
      errors.push({ file: rel, message: `Invalid JSON: ${reason}`, line: lineAt(text, jsonErrorOffset(text, reason)) })
    } else {
      errors.push(yamlError(error, text, rel, 0))
    }
    return undefined
  }
  if (!isRecord(data)) { errors.push({ file: rel, message: 'The file must hold an object with fields.' }); return undefined }
  return data
}

/** A public file referenced from frontmatter must exist below `public/`; it is then registered in `files`. */
function checkPublicFile(cx: FileCx, path: string, src: string) {
  const root = resolve(cx.publicDir)
  const abs = resolve(root, src.replace(/^\/+/, ''))
  try {
    if (!abs.startsWith(root + sep) || !statSync(abs).isFile()) throw new Error('missing')
    const size = statSync(abs).size
    // Images register their pixel size, so pages render width and height and nothing shifts while loading.
    const image = imageInfo(head(abs, 64 * 1024))
    cx.files[src] = { url: src, name: basename(src), size, ...(image ? { width: image.width, height: image.height } : {}) }
  } catch {
    fail(cx, path, `File “${src}” is missing under public/.`)
  }
}

/**
 * Frontmatter → one file's view: translatable leaves hold this file's text, lists hold rows, images hold
 * `file` (main only) and `alt`. Simple forms become stored forms here; validate() checks the rest.
 */
function convertFields(fields: Fields, data: Record<string, unknown>, cx: FileCx): View {
  const out: View = {}
  for (const [key, value] of Object.entries(data)) {
    const field = Object.hasOwn(fields, key) ? fields[key] : undefined
    const path = cx.prefix + key
    if (!field || field.retired) { fail(cx, path, `Unknown field “${key}”.`); continue }
    if (field.type === 'markdown') { fail(cx, path, `“${key}” is the text of the file, not a frontmatter key.`); continue }
    if (!cx.isMain && !isTranslatable(field) && field.type !== 'list' && field.type !== 'rows' && field.type !== 'image') {
      fail(cx, path, `“${key}” is set in the main-language file only.`)
      continue
    }
    switch (field.type) {
      case 'money':
        // 12.5 → 1250 cents; anything else is left for validate() to reject.
        out[key] = typeof value === 'number' ? { amount: Math.round(value * 100) } : value
        break
      case 'file':
        if (typeof value === 'string') { checkPublicFile(cx, path, value); out[key] = { file: value } } else out[key] = value
        break
      case 'choices': {
        // "None" must be said on purpose, as the Studio's "Keine" tap does: deleting the values leaves `[]`, which on a
        // required field is an error instead of a published "none". An option named `none` wins over the word.
        if (value === 'none') { out[key] = field.options.some((o) => o.value === 'none') ? ['none'] : []; break }
        if (Array.isArray(value) && value.length === 0 && !field.optional) {
          const [first, second] = field.options.map((o) => o.value)
          const example = second === undefined ? `[${first}]` : `[${first}, ${second}]`
          fail(cx, path, `“${key}” is empty: write the values, like ${example}, or none when there are none.`)
          break
        }
        out[key] = value
        break
      }
      case 'image': {
        if (!isRecord(value)) { fail(cx, path, `“${key}” needs src and alt.`); break }
        if (!cx.isMain && value.src !== undefined) { fail(cx, path, `“${key}”: src is set in the main-language file only.`); break }
        if (typeof value.src === 'string') checkPublicFile(cx, path, value.src)
        out[key] = { ...(cx.isMain ? { file: value.src } : {}), alt: value.alt }
        break
      }
      case 'list': {
        // A list with one subfield may be written as plain values: `tags: [a, b]` = `tags: [{ name: a }, …]`.
        const only = Object.keys(field.of).length === 1 ? Object.keys(field.of)[0] : undefined
        const rows = Array.isArray(value) && only !== undefined ? value.map((row) => (isRecord(row) ? row : { [only]: row })) : value
        if (!Array.isArray(rows) || !rows.every(isRecord)) { fail(cx, path, `“${key}” must be a list of objects.`); break }
        out[key] = rows.map((row, i) => convertFields(field.of, row, { ...cx, prefix: `${path}.${i}.`, where: [...cx.where, displayOf(cx.where, cx.prefix, path), `row ${i + 1}`] }))
        break
      }
      case 'rows': {
        // One object per row key: `days: { mo: { dish: … }, tu: { … } }`.
        if (!isRecord(value) || !Object.values(value).every(isRecord)) { fail(cx, path, `“${key}” must be an object with one object per row, like mo: { … }.`); break }
        out[key] = Object.fromEntries(Object.entries(value).map(([row, cells]) => [row, convertFields(field.of, cells as Record<string, unknown>, { ...cx, prefix: `${path}.${row}.`, where: [...cx.where, displayOf(cx.where, cx.prefix, path), row] })]))
        break
      }
      default:
        out[key] = value
    }
  }
  return out
}

interface MergeCx {
  main: Locale
  locales: Locale[]
  entryId: string
  prefix: string
  prints: Prints
  /** The file of each locale, for error attribution. */
  rels: Record<Locale, string>
  errors: ContentError[]
  /** Where a list row sits in the main file, for the owner: `['steps', 'row 2']`. */
  where: string[]
}

/** Records a translatable leaf: per-locale values, and the print of every translation (CONTENT.md). */
function localized(path: string, values: Partial<Record<Locale, unknown>>, cx: MergeCx): Partial<Record<Locale, unknown>> {
  for (const locale of cx.locales) {
    if (locale === cx.main || values[locale] === undefined) continue
    cx.prints[path] ??= {}
    cx.prints[path][locale] = printOf(values[cx.main])
  }
  return values
}

/** The views of all locales → one stored data object (translatable leaves per locale, lists merged by index). */
function merge(fields: Fields, views: Partial<Record<Locale, View>>, cx: MergeCx): View {
  const out: View = {}
  const mainView = views[cx.main] ?? {}
  const rowsOf = (value: unknown): View[] => (Array.isArray(value) ? value.filter(isRecord) : [])
  for (const [key, field] of Object.entries(fields)) {
    if (field.retired) continue
    const path = cx.prefix + key
    if (isTranslatable(field)) {
      const values: Partial<Record<Locale, unknown>> = {}
      for (const locale of cx.locales) {
        const value = views[locale]?.[key]
        if (value !== undefined && (locale === cx.main || value !== '')) values[locale] = value
      }
      if (Object.keys(values).length > 0) out[key] = localized(path, values, cx)
    } else if (field.type === 'list') {
      const mainRows = rowsOf(mainView[key])
      for (const locale of cx.locales) {
        // Rows are matched by position: a different count shifts every translated row after the difference.
        const count = views[locale]?.[key] === undefined ? mainRows.length : rowsOf(views[locale]?.[key]).length
        if (locale !== cx.main && count !== mainRows.length) {
          const display = displayOf(cx.where, cx.prefix, path)
          cx.errors.push({ file: cx.rels[locale] ?? '', path, ...(display !== path ? { display } : {}), message: `“${key}” has ${count} rows here and ${mainRows.length} in content/${cx.rels[cx.main] ?? ''}. Each row translates the row at the same place in the main file; write - {} for a row with nothing to translate.` })
        }
      }
      out[key] = mainRows.map((_, i) => {
        const id = rowId(cx.entryId, i)
        const rowViews: Partial<Record<Locale, View>> = {}
        for (const locale of cx.locales) {
          const row = rowsOf(views[locale]?.[key])[i]
          if (row) rowViews[locale] = row
        }
        return { _id: id, ...merge(field.of, rowViews, { ...cx, prefix: `${path}.${id}.`, where: [...cx.where, displayOf(cx.where, cx.prefix, path), `row ${i + 1}`] }) }
      })
    } else if (field.type === 'rows') {
      // Rows are matched by key: a translation names the rows of the main file it translates.
      const mainRows = isRecord(mainView[key]) ? mainView[key] : {}
      for (const locale of cx.locales) {
        const rows = views[locale]?.[key]
        if (locale === cx.main || !isRecord(rows)) continue
        for (const row of Object.keys(rows)) {
          if (Object.hasOwn(mainRows, row)) continue
          const display = displayOf(cx.where, cx.prefix, path)
          cx.errors.push({ file: cx.rels[locale] ?? '', path: `${path}.${row}`, ...(display !== path ? { display } : {}), message: `“${key}” has the row “${row}” here but not in content/${cx.rels[cx.main] ?? ''}. A translation translates the rows of the main file.` })
        }
      }
      if (mainView[key] === undefined) continue
      out[key] = Object.fromEntries(Object.keys(mainRows).map((row) => {
        const rowViews: Partial<Record<Locale, View>> = {}
        for (const locale of cx.locales) {
          const rows = views[locale]?.[key]
          const cells = isRecord(rows) ? rows[row] : undefined
          if (isRecord(cells)) rowViews[locale] = cells
        }
        return [row, merge(field.of, rowViews, { ...cx, prefix: `${path}.${row}.`, where: [...cx.where, displayOf(cx.where, cx.prefix, path), row] })]
      }))
    } else if (field.type === 'image') {
      const image = mainView[key]
      if (!isRecord(image)) continue
      const alt: Partial<Record<Locale, unknown>> = {}
      for (const locale of cx.locales) {
        const value = views[locale]?.[key]
        const text = isRecord(value) ? value.alt : undefined
        if (text !== undefined && (locale === cx.main || text !== '')) alt[locale] = text
      }
      out[key] = { ...(image.file !== undefined ? { file: image.file } : {}), alt: localized(`${path}.alt`, alt, cx) }
    } else if (mainView[key] !== undefined) {
      out[key] = mainView[key]
    }
  }
  return out
}

/** Reads every brick with `source: 'files'` from `contentDir` (layout and rules: CONTENT.md "Dateien").
 *
 * - Collection `docs`: `docs/<n>.<name>.md` (main locale) and `docs/<n>.<name>.<locale>.md`.
 *   Id `docs/<name>`, `order` = n (files without a number come after, by name); entries sorted by order. Slug from
 *   frontmatter `slug`, else `<name>`; a translation may set its own `slug`.
 * - Single `legal`: `legal.md` and `legal.<locale>.md`. One entry, id `legal`.
 * - Frontmatter keys are field names in simple form; the body fills the brick's `body` field.
 *   Translatable fields collect one locale per file into `{ de, en }`. Simple forms: money `12.5` →
 *   `{ amount: 1250 }`; image `{ src: '/img/a.jpg', alt: '…' }` → `{ file: '/img/a.jpg', alt: { de: '…' } }`
 *   (alt per locale file); file `'/docs/a.pdf'` → `{ file: '/docs/a.pdf' }`; choices `none` → `[]` (an empty list on a
 *   required field is an error, so "none" is never left behind by deleting values); list rows get `_id`
 *   `r` + 9 chars of sha256(`<entry id>:<row index>`) and translations merge by row index.
 * - `prints` mark every translation as fresh (printOf of the main value), so a present translation
 *   is never a fallback.
 * - Errors, never thrown: unknown frontmatter key, a locale suffix the site does not have, a
 *   translation without its main file, two entries with the same slug in one locale, a missing
 *   image or file under `publicDir`, and every validate() error of the built entry (mode 'create').
 *   A file with an error is left out; the others are still read.
 */
export async function readContent(contentDir: string, publicDir: string, schema: Schema, options: ReadOptions = {}): Promise<ReadResult> {
  const drafts = options.drafts ?? true
  // `$publishAt` is compared with the site's wall clock, so a time in Vienna means Vienna whatever the build machine.
  const now = wallClockIn(schema.timeZone, options.now)
  const errors: ContentError[] = []
  const warnings: ContentError[] = []
  const notes: ContentError[] = []
  const entries: Record<string, StoredEntry[]> = {}
  // The build's day: a dated change in a file starts with the first build on or after its day (D120).
  const today = now.slice(0, 10)
  let notedAhead = false
  const files: Record<string, FileInfo> = {}
  const images = new Map<string, string>()
  const components = Object.entries(schema.components ?? {})
  // Component image props (`f.image`) hold content image paths; those whose size props the component declares get the pixel size.
  const imageProps = Object.fromEntries(components.map(([tag, def]) => [tag, Object.entries(def.props ?? {}).filter(([, field]) => field.type === 'image').map(([name]) => name)]))
  const sized = Object.fromEntries(components.map(([tag, def]) => [tag, imageProps[tag]!.filter((prop) => imageSizeProps(prop).every((p) => Object.hasOwn(def.props ?? {}, p)))]))
  const main = schema.locales[0]!
  const times = await fileTimes(contentDir)
  // URLs of the entries read so far, over all bricks: bricks with the same route can clash too.
  const urlOwners: { id: string; urls: Partial<Record<Locale, string>> }[] = []

  // Entry IDs of every file collection (main-language files), so a ref may point to a brick read later.
  // A brick whose entries live on the platform is not known here: its refs are not checked.
  const known = new Map<string, Set<string>>()
  // One real entry per collection (`content/people/1.katrin-albers.md is people/katrin-albers`), as the example in a "no such entry" message.
  const idExamples = new Map<string, string>()
  for (const [key, brick] of Object.entries(schema.bricks)) {
    if (brick.source !== 'files' || brick.kind !== 'collection') continue
    known.set(key, new Set((await entryNames(join(contentDir, key))).map((name) => `${key}/${name}`)))
    const first = (await dataNames(join(contentDir, key))).find((file) => extOf(file) !== 'csv' && parseFileName(file).locale === undefined)
    if (first !== undefined) idExamples.set(key, `content/${key}/${first} is ${key}/${parseFileName(first).name}`)
  }
  const refs = (brick: string, id: string) => known.get(brick)?.has(id) ?? true
  // Entries left out as drafts: an entry that belongs to one goes with it (below).
  const leftOut = new Set<string>()

  for (const [key, brick] of Object.entries(schema.bricks)) {
    if (brick.source !== 'files') continue
    entries[key] = []
    const folder = brick.kind === 'collection'
    const names = await dataNames(folder ? join(contentDir, key) : contentDir)
    const relOf = (name: string) => (folder ? `${key}/${name}` : name)
    const candidates = names.filter((name) => folder || parseFileName(name).name === key)
    if (candidates.length === 0) continue

    // Brick-wide problems are reported for every file of the brick; the brick then gives no entries.
    const brickProblems = brickProblemsOf(brick)
    if (brickProblems.length > 0) {
      for (const name of candidates) for (const problem of brickProblems) errors.push({ file: relOf(name), ...problem })
      continue
    }

    // Group the sources by name: one main source and one per translation.
    const groups = new Map<string, { number?: number; rank: string; main?: Src; translations: Record<Locale, Src> }>()
    const place = (src: Src, parsed: { name: string; number?: number; locale?: string }, rank: string, line?: number) => {
      const { rel } = src
      const report = (message: string) => errors.push({ file: rel, message, ...(line !== undefined ? { line } : {}) })
      if (parsed.locale !== undefined && parsed.locale === main) return report(`The main language “${main}” takes no suffix in the file name.`)
      // The name is the same in both homes (D96): an import to the platform keeps it, so it has the shape of a slug.
      if (folder && !isEntryName(parsed.name)) {
        return report(src.csv ? `The “slug” cell “${parsed.name}” is no entry name. ${ENTRY_NAME_RULE}` : `The file name gives the entry name “${parsed.name}”. ${ENTRY_NAME_RULE} Rename the file.`)
      }
      const locale = parsed.locale === undefined ? main : schema.locales.find((l) => l === parsed.locale)
      if (locale === undefined) return report(`Language “${parsed.locale}” is not in the site's locales.`)
      const group = groups.get(parsed.name) ?? { rank, translations: {} }
      groups.set(parsed.name, group)
      if (locale === main) {
        if (group.main !== undefined) return report(`Entry “${relOf(parsed.name)}” is in two files: content/${group.main.rel} and content/${rel}. Keep one and delete or rename the other.`)
        group.main = src
        group.number = parsed.number
        group.rank = rank
      } else {
        if (group.translations[locale] !== undefined) return report(`Language “${locale}” of “${relOf(parsed.name)}” is in two files: content/${group.translations[locale]!.rel} and content/${rel}. Keep one and delete or rename the other.`)
        group.translations[locale] = src
      }
    }
    for (const name of candidates) {
      const rel = relOf(name)
      const path = join(contentDir, rel)
      if (extOf(name) === 'csv') {
        if (!folder) { errors.push({ file: rel, message: 'CSV files work for collections only.' }); continue }
        const csv = parseCsv(await readFile(path, 'utf8'))
        if ('error' in csv) { errors.push({ file: rel, ...csv.error }); continue }
        const [header, ...rows] = csv.rows
        if (header === undefined) continue
        const columns = header.cells.map((c) => c.trim())
        const slugColumn = columns.indexOf('slug')
        if (slugColumn < 0) { errors.push({ file: rel, line: header.line, message: 'The CSV file needs a “slug” column.' }); continue }
        const localeColumn = columns.indexOf('locale')
        rows.forEach((row, index) => {
          const slug = (row.cells[slugColumn] ?? '').trim()
          if (slug === '') { errors.push({ file: rel, line: row.line, message: 'The “slug” cell is empty.' }); return }
          const locale = localeColumn < 0 ? '' : (row.cells[localeColumn] ?? '').trim()
          place({ rel, path, name: slug, csv: { columns, row } }, { name: slug, locale: locale || undefined }, `${name}\u0000${String(index).padStart(8, '0')}`, row.line)
        })
      } else {
        const parsed = parseFileName(name)
        place({ rel, path, name: parsed.name }, parsed, parsed.name)
      }
    }

    // Order: numbered files by number, then the others by name.
    const sorted = [...groups.entries()].sort(([, ga], [, gb]) => {
      const a = ga.rank
      const b = gb.rank
      if (ga.number !== undefined && gb.number !== undefined) return ga.number - gb.number || (a < b ? -1 : a > b ? 1 : 0)
      if (ga.number !== undefined) return -1
      if (gb.number !== undefined) return 1
      return a < b ? -1 : a > b ? 1 : 0
    })
    let next = Math.max(0, ...sorted.map(([, g]) => g.number ?? 0))

    const slugKey = slugKeyOf(brick)
    const slugOwner = new Map<string, string>()
    for (const [name, group] of sorted) {
      if (group.main === undefined) {
        for (const src of Object.values(group.translations)) errors.push({ file: src.rel, message: `“${src.rel}” has no main-language file.`, ...(src.csv ? { line: src.csv.row.line } : {}) })
        continue
      }
      const id = folder ? `${key}/${name}` : key
      const order = folder ? (group.number ?? ++next) : undefined
      const mainRel = group.main.rel

      const mainView = await readDoc(group.main, true)
      if (mainView === 'draft') leftOut.add(id)
      if (mainView === undefined || mainView === 'draft') continue
      const views: Partial<Record<Locale, View>> = { [main]: mainView.view }
      // The parsed body per locale; it replaces the body text once validate() has checked the text.
      const trees: Partial<Record<Locale, MarkdownTree>> = { [main]: mainView.tree }
      const rels: Record<Locale, string> = { [main]: mainRel }
      const lines: Partial<Record<Locale, number>> = { [main]: group.main.csv?.row.line }
      // The file line where each locale's body text starts, so a problem at a line of the text points into the file.
      const bodyLines: Partial<Record<Locale, number>> = { [main]: mainView.bodyLine }
      for (const locale of schema.locales) {
        const src = group.translations[locale]
        if (src === undefined) continue
        const doc = await readDoc(src, false)
        if (doc === undefined || doc === 'draft') continue
        views[locale] = doc.view
        if (doc.tree) trees[locale] = doc.tree
        rels[locale] = src.rel
        lines[locale] = src.csv?.row.line
        bodyLines[locale] = doc.bodyLine
      }

      const prints: Prints = {}
      const mergeErrors: ContentError[] = []
      const data = merge(brick.fields, views, { main, locales: schema.locales, entryId: id, prefix: '', prints, rels, errors: mergeErrors, where: [] })
      if (mergeErrors.length > 0) { errors.push(...mergeErrors); continue }

      const result = await validate(schema, key, data, { mode: 'create', refs })
      if (result.errors.length > 0) {
        for (const issue of result.errors) {
          const last = issue.path.split('.').pop()
          const locale = schema.locales.find((l) => l === last)
          const at = locale && rels[locale] ? locale : main
          const bodyLine = bodyLines[at]
          const textLine = issue.key === 'issues.markdownAt' && issue.path.split('.')[0] === markdownKeyOf(brick) ? issue.params?.line : undefined
          const line = typeof textLine === 'number' && bodyLine !== undefined ? bodyLine + textLine - 1 : lines[at]
          const params = line !== undefined && textLine !== undefined ? { ...issue.params, line } : issue.params
          const where = locate(brick.fields, data, issue.path)
          const display = where.shown.join(', ')
          errors.push({
            file: rels[at] ?? mainRel,
            path: issue.path,
            ...(display !== issue.path ? { display } : {}),
            message: filesMessage(issue.key, params, where, { currency: schema.currency, refs, idExamples }),
            ...(line !== undefined ? { line } : {}),
          })
        }
        continue
      }

      // `$changes` (D117, D119): converted like the fields, then checked with the entry's values.
      let changes: Change[] | undefined
      if (mainView.changes !== undefined) {
        const changeErrors: ContentError[] = []
        const cx: FileCx = { file: mainRel, isMain: true, prefix: '', publicDir, files, errors: changeErrors, line: group.main.csv?.row.line, where: [] }
        const stored = storedChanges(mainView.changes, cx, id)
        const issues = changeErrors.length ? [] : await changeIssues(schema, key, data as Record<string, Json>, stored, { refs })
        for (const issue of issues) {
          const path = issue.path.startsWith('$changes') ? issue.path : `$changes.${issue.change}.set.${issue.path}`
          changeErrors.push({ file: mainRel, path, message: coreMessage('en', issue.key, issue.params), ...(cx.line !== undefined ? { line: cx.line } : {}) })
        }
        if (changeErrors.length) { errors.push(...changeErrors); continue }
        changes = stored as Change[]
      }

      // The text is valid: the tree takes its place (the bundle carries trees, CONTENT.md Phase 14), unless the caller
      // wants the text the platform stores.
      const markdownKey = markdownKeyOf(brick)
      const texts = markdownKey === undefined ? undefined : data[markdownKey]
      if (options.markdown !== 'text' && markdownKey !== undefined && isRecord(texts)) {
        data[markdownKey] = Object.fromEntries(Object.entries(texts).map(([locale, text]) => [locale, trees[locale as Locale] ?? text]))
        // Prints are of the stored main value, which is now the tree; a print of the text would mark every translation stale.
        for (const locale of Object.keys(prints[markdownKey] ?? {})) prints[markdownKey]![locale as Locale] = printOf((data[markdownKey] as Record<string, unknown>)[main])
      }

      // Two entries with the same slug in one locale collide on the URL; the later one is left out.
      const slugs = slugKey ? data[slugKey] : undefined
      const taken: { key: string; locale: Locale; slug: string }[] = []
      if (slugKey && isRecord(slugs)) {
        for (const locale of schema.locales) {
          const slug = slugs[locale]
          if (typeof slug === 'string') taken.push({ key: `${locale}:${slug}`, locale, slug })
        }
      }
      const clash = taken.find((t) => slugOwner.has(t.key))
      if (clash) {
        errors.push({ file: rels[clash.locale] ?? mainRel, path: slugKey, message: `Slug “${clash.slug}” is already taken by “${slugOwner.get(clash.key)}”.` })
        continue
      }

      // Values are validated above; they come from JSON-like YAML and parsed Markdown. The bundle is the bundle of the
      // build's day (D120): a change whose day has come is in the values, the others wait (only `timeline.public`
      // fields of them reach a page, as `upcoming`).
      const entry: StoredEntry = { id, data: dataOn(data as Record<string, Json>, changes, today) }
      if (changes) {
        const ahead = waitingChanges(changes, today)
        if (ahead.length) entry.changes = ahead
      }
      // Old paths of the entry (main-language file only), beside the fields: the bundle forwards them (`oldUrls`).
      if (mainView.redirectFrom?.length) entry.redirectFrom = mainView.redirectFrom

      // A locale without its own slug takes the main one (`routeUrls`), so the URL can clash although the written slugs differ.
      // Every locale counts, translated or not: the entry gets that page as soon as it is translated.
      const urls = brick.kind === 'collection' ? routeUrls(schema, brick, entry) : {}
      const urlClash = urlClashes([...urlOwners, { id, urls }]).find((c) => c.second === id)
      if (urlClash) {
        errors.push({ file: rels[urlClash.locale] ?? mainRel, path: slugKey, message: `URL “${urlClash.url}” is already taken by “${urlClash.first}”.` })
        continue
      }
      urlOwners.push({ id, urls })
      for (const t of taken) slugOwner.set(t.key, id)
      // Checked above like an online entry; a planned one stays out until its `$publishAt`.
      if (mainView.planned) { leftOut.add(id); continue }
      // Only an entry that is read in tells about its changes: one held back or refused above prints no value.
      if (changes) reportChanges(mainView.changes as Record<string, unknown>[], changes, mainRel, group.main.csv?.row.line)
      if (order !== undefined) entry.order = order
      entry.updatedAt = times.updatedAt(Object.values(rels))
      entry.sources = Object.fromEntries(Object.entries(rels).map(([locale, rel]) => [locale, times.source(rel!)]))
      if (Object.keys(prints).length > 0) entry.prints = prints
      entries[key]!.push(entry)
    }

    /**
     * `$changes` as written → stored changes: each `set` read exactly as the fields are (money in units, an image as
     * `{ src, alt }`, a text per file), `null` kept to clear a field. Anything not in that shape, and unknown fields,
     * go to the core check unchanged, which names them.
     */
    function storedChanges(raw: unknown, cx: FileCx, id: string): unknown {
      if (!Array.isArray(raw)) return raw
      return raw.map((item: unknown, i) => {
        if (!isRecord(item) || !isRecord(item.set)) return item
        const prefix = `$changes.${i}.set.`
        const set = item.set
        const live = (name: string) => Object.hasOwn(brick.fields, name) && !brick.fields[name]!.retired
        // A file's Markdown is built into a tree with the entry; a text in a change has no such step (D122).
        const markdown = (name: string) => live(name) && brick.fields[name]!.type === 'markdown'
        for (const name of Object.keys(set).filter(markdown)) fail(cx, `${prefix}${name}`, `“${name}” is a Markdown text, and a Markdown text cannot be in a change in a file. Change the text in the file on its day.`)
        const written = Object.fromEntries(Object.entries(set).filter(([name, value]) => value !== null && live(name) && !markdown(name)))
        const view = convertFields(brick.fields, written, { ...cx, prefix })
        const subset = Object.fromEntries(Object.keys(view).map((name) => [name, brick.fields[name]!]))
        const merged = merge(subset, { [main]: view }, { main, locales: schema.locales, entryId: id, prefix, prints: {}, rels: { [main]: cx.file }, errors: cx.errors, where: [] })
        const rest = Object.fromEntries(Object.entries(set).filter(([name, value]) => value === null || !live(name)))
        return { ...item, set: { ...rest, ...merged } }
      })
    }

    /**
     * The warning for each field of a change whose day has come (it would hide every later edit of the field), and the
     * note, once per site, that a change still ahead waits for a build (D122).
     */
    function reportChanges(written: Record<string, unknown>[], changes: Change[], file: string, line: number | undefined) {
      const at = line !== undefined ? { line } : {}
      changes.forEach((change, i) => {
        if (change.from > today) {
          if (!notedAhead) notes.push({ file, path: `$changes.${i}`, message: `A change from ${change.from} is still to come: a dated change in a file starts with the first build on or after its day. Build the site on that day, for example with a daily build.`, ...at })
          notedAhead = true
          return
        }
        const set = isRecord(written[i]?.set) ? written[i]!.set as Record<string, unknown> : {}
        for (const field of Object.keys(change.set)) {
          // A change that clears the field asks for it to go, not for `null` to be written into it.
          const step = change.set[field] === null ? `remove “${field}” from the entry` : `write ${JSON.stringify(set[field])} into “${field}”`
          warnings.push({ file, path: `$changes.${i}.set.${field}`, message: `The day of this change (${change.from}) has come: ${step} and remove the change. While it stays, it wins over the field.`, ...at })
        }
      })
    }

    /**
     * The two notes on the `publishedOn` date of a main file: it is before the day of `$publishAt` (the entry shows a
     * day before it goes online), or it is after today and nothing holds the entry back (it is online now; before
     * `$publishAt`, a date in the future hid it).
     */
    function notePublishedOn(src: Src, fields: Record<string, unknown>, publishAt: string | undefined, draft: boolean) {
      const name = brick.kind === 'collection' ? brick.publishedOn : undefined
      const day = name === undefined ? undefined : fields[name]
      if (name === undefined || !isDate(day)) return
      const note = (message: string) => notes.push({ file: src.rel, path: name, message, ...(src.csv ? { line: src.csv.row.line } : {}) })
      if (publishAt !== undefined && day < publishAt.slice(0, 10)) note(`“${name}” (publishedOn) is ${day}, before the day of $publishAt (${publishAt.slice(0, 10)}): the entry shows a day before it goes online.`)
      // A draft (read with drafts on) is not online, whatever its date says.
      else if (publishAt === undefined && !draft && day > now.slice(0, 10)) note(`“${name}” (publishedOn) is ${day}, after today, and the entry has no $publishAt: it is online now. Add \`$publishAt: ${day}\` to hold it back until that day.`)
    }

    /**
     * Reads one source: its data converted (Markdown: frontmatter, body text into the brick's markdown field, plus
     * the parsed body; YAML, JSON and CSV: the whole file or row is data and there is no body).
     * `'draft'` when the entry is marked `$draft: true` and drafts are off.
     */
    async function readDoc(src: Src, isMain: boolean): Promise<{ view: View; tree?: MarkdownTree; bodyLine?: number; redirectFrom?: string[]; planned?: true; changes?: unknown } | 'draft' | undefined> {
      const { rel } = src
      const ext = extOf(rel)
      const markdownKey = markdownKeyOf(brick)
      const fileErrors: ContentError[] = []
      const cx: FileCx = { file: rel, isMain, prefix: '', publicDir, files, errors: fileErrors, line: src.csv?.row.line, where: [] }
      let data: Record<string, unknown>
      let parsed: Awaited<ReturnType<typeof parseFile>> | undefined
      let bodyLine: number | undefined
      if (src.csv) {
        data = {}
        const { columns, row } = src.csv
        columns.forEach((column, i) => {
          const cell = (row.cells[i] ?? '').trim()
          if (column === '' || column === 'slug' || column === 'locale' || cell === '') return
          // A `$` column is not a field: its cell is kept as written for splitKeys (`$draft` takes `true`).
          if (column.startsWith('$')) { data[column] = column === '$draft' && cell === 'true' ? true : cell; return }
          const result = cellValue(brick.fields, column, cell)
          if ('error' in result) fail(cx, column, result.error)
          else data[column] = result.value
        })
      } else {
        const text = await readFile(src.path, 'utf8')
        if (ext === 'md') {
          // Parsed once, with the file's frontmatter; the profile problems are reported by validate() on the body text.
          const field = markdownKey === undefined ? undefined : brick.fields[markdownKey]
          try {
            parsed = await parseFile(text, { profile: field?.type === 'markdown' ? effectiveProfile(field) : undefined, components: schema.components })
          } catch (error) {
            if (!isYamlError(error)) throw error
            errors.push(yamlError(error, text, rel, 1))
            return undefined
          }
          for (const problem of parsed.previewProblems) fail(cx, markdownKey ?? 'body', `In a \`\`\`md preview fence: ${coreMessage('en', problem.key, problem.params)}`)
          data = parsed.frontmatter
          const imageCx = { contentDir, publicDir, file: rel, images, renames: new Map<string, string>(), imageProps, sized, fail: (message: string) => fileErrors.push({ file: rel, message }) }
          rewriteImages(parsed.value.nodes, imageCx)
          rewriteImages(parsed.value.summary, imageCx)
          parsed.body = renameInText(parsed.body, imageCx.renames)
          // The body is the end of the file (after the frontmatter); renames keep its lines.
          bodyLine = text.split('\n').length - parsed.body.split('\n').length + 1
        } else {
          const raw = parseDataFile(text, ext, rel, errors)
          if (raw === undefined) return undefined
          data = raw
        }
      }
      const { fields, dollar } = splitKeys(cx, brick.fields, data)
      // A CSV cell holds one value; a list of changes needs a file of its own.
      if (src.csv && dollar.$changes !== undefined) fail(cx, '$changes', '“$changes” is a list of changes, which a CSV cell cannot hold. Write the entry as a YAML, JSON or Markdown file.')
      const redirects = dollar.$redirectFrom === undefined ? undefined : redirectPaths(cx, dollar.$redirectFrom)
      if (dollar.$draft !== undefined && dollar.$draft !== true) fail(cx, '$draft', '“$draft” takes only true. Leave it out for an entry that is online.')
      const draft = dollar.$draft === true
      const publishAt = dollar.$publishAt === undefined ? undefined : publishTime(cx, dollar.$publishAt)
      if (draft && dollar.$publishAt !== undefined) fail(cx, '$publishAt', '“$draft” and “$publishAt” together: a draft with a time is `$publishAt` alone. Remove `$draft: true`.')
      if (draft && !drafts && fileErrors.length === 0) return 'draft'
      // Before its `$publishAt` an entry is treated as a draft (shown only when drafts are), but it is checked in full
      // like an online entry: it goes online at a later build nobody watches, so a broken one fails the build now.
      const planned = !drafts && publishAt !== undefined && publishAt > now
      const view = convertFields(brick.fields, fields, cx)
      const hasBody = parsed !== undefined && parsed.value.nodes.length > 0
      if (parsed === undefined && markdownKey !== undefined) {
        fail(cx, markdownKey, `“${markdownKey}” is a markdown field: it is the text of a .md file, and ${ext === 'csv' ? 'CSV' : ext.toUpperCase()} files have no text.`)
      }
      if (parsed !== undefined && markdownKey !== undefined && hasBody) view[markdownKey] = parsed.body
      if (markdownKey === undefined && hasBody) fail(cx, 'body', `The text fits no field of “${key}”: the brick states no \`body\` (the markdown field the text of a file fills).`)
      // The slug defaults to the entry's name: the file name without its number (CONTENT.md "Slug"), for CSV the `slug` cell.
      if (slugKey !== undefined && view[slugKey] === undefined) view[slugKey] = src.name
      errors.push(...fileErrors)
      if (isMain && fileErrors.length === 0) notePublishedOn(src, fields, publishAt, draft)
      // File content changes only with a build: a time still to come needs a build on that day (spec 5.5, rule 10).
      if (isMain && fileErrors.length === 0 && publishAt !== undefined && publishAt > now) {
        notes.push({ file: src.rel, path: '$publishAt', message: `“$publishAt” is ${publishAt}, still to come: the entry goes online at the first build after that time. Build the site on that day, for example with a daily build.`, ...(src.csv ? { line: src.csv.row.line } : {}) })
      }
      return fileErrors.length > 0 ? undefined : { view, tree: markdownKey !== undefined && hasBody ? parsed!.value : undefined, bodyLine, redirectFrom: redirects, planned: planned ? true : undefined, ...(dollar.$changes !== undefined ? { changes: dollar.$changes } : {}) }
    }
  }

  // An entry whose required single ref names a draft that was left out (a session of a draft event) is left out too:
  // it belongs to something that is not public yet. Repeated while that removes more (a chain of such refs).
  for (let size = -1; size !== leftOut.size;) {
    size = leftOut.size
    for (const [key, list] of Object.entries(entries)) {
      const owners = Object.entries(schema.bricks[key]?.fields ?? {}).filter(([, field]) => field.type === 'ref' && !field.multiple && !field.optional).map(([name]) => name)
      if (owners.length === 0) continue
      entries[key] = list.filter((entry) => {
        const draft = owners.some((name) => leftOut.has(entry.data[name] as string))
        if (draft) leftOut.add(entry.id)
        return !draft
      })
    }
  }

  return { entries, files, images, errors, warnings, notes }
}

/** A field's label in every language: a plain label is its own only text. */
const labelTexts = (field: Field): string[] => (typeof field.label === 'string' ? [field.label] : Object.values(field.label))

interface Located {
  /** The fields of the brick and of each list row on the path: where a label in the issue can come from. */
  sets: Fields[]
  /** The field the path ends in (not a list row or a locale). */
  field?: Field
  /** The stored value at the path. */
  value: unknown
  /** The path as the owner reads it: field keys, `row N` for a list row, a locale after its key. */
  shown: string[]
}

/** Walks a validate() path (`exceptions.r1a2b3c4d5.closed.en`) through the brick's fields and the stored data. */
function locate(root: Fields, data: unknown, path: string): Located {
  const sets: Fields[] = [root]
  const shown: string[] = []
  let fields = root
  let field: Field | undefined
  let value: unknown = data
  for (const segment of path.split('.')) {
    if (field?.type === 'list') {
      const rows = Array.isArray(value) ? value : []
      const index = rows.findIndex((row) => isRecord(row) && row._id === segment)
      shown.push(index < 0 ? segment : `row ${index + 1}`)
      value = rows[index]
      fields = field.of
      sets.push(fields)
      field = undefined
    } else if (field?.type === 'rows') {
      // A row key names the row as it is written in the file.
      shown.push(segment)
      value = isRecord(value) ? value[segment] : undefined
      fields = field.of
      sets.push(fields)
      field = undefined
    } else if (field) {
      // A locale after a translatable key, or `alt` and a locale after an image key.
      shown[shown.length - 1] += `.${segment}`
      value = isRecord(value) ? value[segment] : undefined
    } else {
      field = Object.hasOwn(fields, segment) ? fields[segment] : undefined
      shown.push(segment)
      value = isRecord(value) ? value[segment] : undefined
    }
  }
  return { sets, field, value, shown }
}

/**
 * One validate() issue as a file owner reads it: the field is named by its key (the label is a Studio word, and may be
 * German), and a value that has a form in a file is told with that form (euros, not cents).
 */
function filesMessage(
  key: string,
  params: Record<string, unknown> | undefined,
  at: Located,
  site: { currency: string; refs: (brick: string, id: string) => boolean; idExamples: Map<string, string> },
): string {
  const keys = new Map<unknown, string>()
  for (const set of at.sets) for (const [name, field] of Object.entries(set)) for (const text of labelTexts(field)) keys.set(text, name)
  const named = Object.fromEntries(Object.entries(params ?? {}).map(([name, value]) => [name, keys.get(value) ?? value]))
  const name = at.shown[at.shown.length - 1]?.split('.')[0] ?? ''
  switch (key) {
    case 'issues.notMoney': {
      const currency = at.field?.type === 'money' && at.field.currency ? at.field.currency : site.currency
      return `“${name}” must be a number in ${currency}, like 65 or 12.50 (no currency sign, no thousands separator).`
    }
    case 'issues.badDate':
      return `“${name}” is not a valid date: write it as YYYY-MM-DD, like 2026-10-24.`
    case 'issues.badTime':
      return `“${name}” is not a valid time: write it as HH:MM, like 09:30.`
    case 'issues.badDateRange':
      return `“${name}” needs from and to: ${name}: { from: 2026-11-14, to: 2026-11-14 } (the same date twice for one day).`
    case 'issues.refGone': {
      const to = at.field?.type === 'ref' ? at.field.to : undefined
      const ids = Array.isArray(at.value) ? at.value : [at.value]
      const missing = to === undefined ? undefined : ids.find((id) => typeof id === 'string' && !site.refs(to, id))
      const example = to === undefined ? undefined : site.idExamples.get(to)
      return `There is no entry “${String(missing ?? at.value)}”. An id is the folder and the file name without number and language${example ? `: ${example}` : ''}.`
    }
    default:
      return coreMessage('en', key, named as Parameters<typeof coreMessage>[2])
  }
}

/** The field a file's body fills: the brick's `body`. */
function markdownKeyOf(brick: Brick): string | undefined {
  return brick.body
}

/** The names of a collection folder's main-language entries: file names, and the slugs of CSV rows. Unreadable CSV is reported later. */
async function entryNames(dir: string): Promise<string[]> {
  const names: string[] = []
  for (const file of await dataNames(dir)) {
    if (extOf(file) !== 'csv') {
      const parsed = parseFileName(file)
      if (parsed.locale === undefined) names.push(parsed.name)
      continue
    }
    const csv = parseCsv(await readFile(join(dir, file), 'utf8'))
    if ('error' in csv || csv.rows.length === 0) continue
    const columns = csv.rows[0]!.cells.map((c) => c.trim())
    const slug = columns.indexOf('slug')
    const locale = columns.indexOf('locale')
    for (const row of csv.rows.slice(1)) {
      const name = (row.cells[slug] ?? '').trim()
      if (slug >= 0 && name !== '' && (locale < 0 || (row.cells[locale] ?? '').trim() === '')) names.push(name)
    }
  }
  return names
}

/** Content files (`.md`, `.yml`, `.yaml`, `.json`, `.csv`) directly in `dir`, by name; a missing folder has none. */
async function dataNames(dir: string): Promise<string[]> {
  const dirents = await readdir(dir, { withFileTypes: true }).catch(() => [])
  return dirents.filter((d) => d.isFile() && extensions.some((e) => d.name.endsWith(`.${e}`))).map((d) => d.name).sort()
}

/** Problems that make every file of a brick unreadable: more than one markdown field. */
function brickProblemsOf(brick: Brick): { path?: string; message: string }[] {
  const problems: { path?: string; message: string }[] = []
  if (Object.values(brick.fields).filter((f) => f.type === 'markdown' && !f.retired).length > 1) {
    problems.push({ message: 'The file brick has more than one markdown field.' })
  }
  return problems
}
