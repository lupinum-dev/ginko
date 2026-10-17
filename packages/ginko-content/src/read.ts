import { statSync } from 'node:fs'
import { readdir, readFile } from 'node:fs/promises'
import { basename, join, resolve, sep } from 'node:path'
import type {
  Brick, Fields, Json, Locale, MarkdownTree,
} from '@lupinum/ginko'
import {
  coreMessage, effectiveProfile, imageInfo, isTranslatable, printOf, sha256, slugify, routeUrls, todayIn, urlClashes, validate, isDate, type FileInfo, type Schema, type StoredEntry,
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
  message: string
  /** 1-based line in the file, when the error belongs to one (YAML, JSON and CSV parse errors, CSV rows). */
  line?: number
}

/**
 * One error as `ginko check` and the build print it: `content/<file>:<line> (<field>): <message>`.
 * @internal Loaded by the Ginko module and CLI; sites do not import it.
 */
export function errorLine(e: ContentError): string {
  return `content/${e.file}${e.line !== undefined ? `:${e.line}` : ''}${e.path ? ` (${e.path})` : ''}: ${e.message}`
}

export interface ReadOptions {
  /**
   * `false` leaves out entries marked `draft: true`, and scheduled entries: in a collection with drafts that lists its
   * entries newest first by a date (`drafts: true`, `order: { field, dir: 'desc' }`), an entry dated after `today`.
   * Default `true` (dev shows both).
   */
  drafts?: boolean
  /** The build day (`YYYY-MM-DD`) for scheduled entries. Default: today in the schema's time zone. */
  today?: string
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
}

function fail(cx: FileCx, path: string, message: string) {
  cx.errors.push({ file: cx.file, path, message, ...(cx.line !== undefined ? { line: cx.line } : {}) })
}

/** The reserved key `redirectFrom`: one old path or a list of them, each starting with `/`. Only the main-language file may set it. */
function redirectPaths(cx: FileCx, value: unknown): string[] | undefined {
  const list = Array.isArray(value) ? value : [value]
  if (!list.every((p): p is string => typeof p === 'string' && p.startsWith('/') && !p.startsWith('//'))) {
    fail(cx, 'redirectFrom', '“redirectFrom” must be a path or a list of paths, each starting with “/”.')
    return undefined
  }
  if (!cx.isMain) {
    fail(cx, 'redirectFrom', '“redirectFrom” belongs in the main-language file.')
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
      const mark = (error as { mark?: { line?: number }; reason?: string }).mark
      const why = (error as { reason?: string }).reason ?? reason.split('\n')[0]
      errors.push({ file: rel, message: `Invalid YAML: ${why}`, ...(typeof mark?.line === 'number' ? { line: mark.line + 1 } : {}) })
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
    if (field.type === 'markdown') { fail(cx, path, `“${field.label}” is the text of the file, not a frontmatter key.`); continue }
    if (!cx.isMain && !isTranslatable(field) && field.type !== 'list' && field.type !== 'image') {
      fail(cx, path, `“${field.label}” is set in the main-language file only.`)
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
      case 'image': {
        if (!isRecord(value)) { fail(cx, path, `“${field.label}” needs src and alt.`); break }
        if (!cx.isMain && value.src !== undefined) { fail(cx, path, `“${field.label}”: src is set in the main-language file only.`); break }
        if (typeof value.src === 'string') checkPublicFile(cx, path, value.src)
        out[key] = { ...(cx.isMain ? { file: value.src } : {}), alt: value.alt }
        break
      }
      case 'list': {
        // A list with one subfield may be written as plain values: `tags: [a, b]` = `tags: [{ name: a }, …]`.
        const only = Object.keys(field.of).length === 1 ? Object.keys(field.of)[0] : undefined
        const rows = Array.isArray(value) && only !== undefined ? value.map((row) => (isRecord(row) ? row : { [only]: row })) : value
        if (!Array.isArray(rows) || !rows.every(isRecord)) { fail(cx, path, `“${field.label}” must be a list of objects.`); break }
        out[key] = rows.map((row, i) => convertFields(field.of, row, { ...cx, prefix: `${path}.${i}.` }))
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
          cx.errors.push({ file: cx.rels[locale] ?? '', path, message: `“${key}” has ${count} rows here and ${mainRows.length} in content/${cx.rels[cx.main] ?? ''}. Each row translates the row at the same place in the main file; write - {} for a row with nothing to translate.` })
        }
      }
      out[key] = mainRows.map((_, i) => {
        const id = rowId(cx.entryId, i)
        const rowViews: Partial<Record<Locale, View>> = {}
        for (const locale of cx.locales) {
          const row = rowsOf(views[locale]?.[key])[i]
          if (row) rowViews[locale] = row
        }
        return { _id: id, ...merge(field.of, rowViews, { ...cx, prefix: `${path}.${id}.` }) }
      })
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
 * - Frontmatter keys are field names in simple form; the body fills the brick's markdown field.
 *   Translatable fields collect one locale per file into `{ de, en }`. Simple forms: money `12.5` →
 *   `{ amount: 1250 }`; image `{ src: '/img/a.jpg', alt: '…' }` → `{ file: '/img/a.jpg', alt: { de: '…' } }`
 *   (alt per locale file); file `'/docs/a.pdf'` → `{ file: '/docs/a.pdf' }`; list rows get `_id`
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
  const today = options.today ?? todayIn(schema.timeZone)
  const errors: ContentError[] = []
  const entries: Record<string, StoredEntry[]> = {}
  const files: Record<string, FileInfo> = {}
  const images = new Map<string, string>()
  const components = Object.entries(schema.components ?? {})
  // Component image props (`f.image`) hold content image paths; `width` + `height` components get the pixel size.
  const imageProps = Object.fromEntries(components.map(([tag, def]) => [tag, Object.entries(def.props ?? {}).filter(([, field]) => field.type === 'image').map(([name]) => name)]))
  const sized = new Set(components.filter(([, def]) => def.props && 'width' in def.props && 'height' in def.props).map(([tag]) => tag))
  const main = schema.locales[0]!
  const times = await fileTimes(contentDir)
  // URLs of the entries read so far, over all bricks: bricks with the same route can clash too.
  const urlOwners: { id: string; urls: Partial<Record<Locale, string>> }[] = []

  // Entry IDs of every file collection (main-language files), so a ref may point to a brick read later.
  // A brick whose entries live on the platform is not known here: its refs are not checked.
  const known = new Map<string, Set<string>>()
  for (const [key, brick] of Object.entries(schema.bricks)) {
    if (brick.source !== 'files' || brick.kind !== 'collection') continue
    known.set(key, new Set((await entryNames(join(contentDir, key))).map((name) => `${key}/${name}`)))
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
      const locale = parsed.locale === undefined ? main : schema.locales.find((l) => l === parsed.locale)
      if (locale === undefined) return report(`Language “${parsed.locale}” is not in the site's locales.`)
      const group = groups.get(parsed.name) ?? { rank, translations: {} }
      groups.set(parsed.name, group)
      if (locale === main) {
        if (group.main !== undefined) return report(`Entry “${relOf(parsed.name)}” exists twice.`)
        group.main = src
        group.number = parsed.number
        group.rank = rank
      } else {
        if (group.translations[locale] !== undefined) return report(`Language “${locale}” exists twice for this entry.`)
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
    const dateKey = scheduleKeyOf(brick)
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
      const data = merge(brick.fields, views, { main, locales: schema.locales, entryId: id, prefix: '', prints, rels, errors: mergeErrors })
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
          errors.push({ file: rels[at] ?? mainRel, path: issue.path, message: coreMessage('en', issue.key, params), ...(line !== undefined ? { line } : {}) })
        }
        continue
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

      // Values are validated above; they come from JSON-like YAML and parsed Markdown.
      const entry: StoredEntry = { id, data: data as Record<string, Json> }
      // Old paths of the entry (main-language file only): stored beside the fields so the bundle carries them for `entryRedirects`.
      if (mainView.redirectFrom?.length) entry.data.redirectFrom = mainView.redirectFrom
      // Only reachable when drafts are on (dev): the site can mark the entry as a draft.
      if (mainView.draft) entry.data.draft = true

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
      // Checked above like a published entry; a scheduled one stays out until its date.
      if (mainView.scheduled) { leftOut.add(id); continue }
      if (order !== undefined) entry.order = order
      entry.updatedAt = times.updatedAt(Object.values(rels))
      entry.sources = Object.fromEntries(Object.entries(rels).map(([locale, rel]) => [locale, times.source(rel!)]))
      if (Object.keys(prints).length > 0) entry.prints = prints
      entries[key]!.push(entry)
    }

    /**
     * Reads one source: its data converted (Markdown: frontmatter, body text into the brick's markdown field, plus
     * the parsed body; YAML, JSON and CSV: the whole file or row is data and there is no body).
     * `'draft'` when the entry is marked `draft: true` and drafts are off.
     */
    async function readDoc(src: Src, isMain: boolean): Promise<{ view: View; tree?: MarkdownTree; bodyLine?: number; redirectFrom?: string[]; draft?: true; scheduled?: true } | 'draft' | undefined> {
      const { rel } = src
      const ext = extOf(rel)
      const markdownKey = markdownKeyOf(brick)
      const fileErrors: ContentError[] = []
      const cx: FileCx = { file: rel, isMain, prefix: '', publicDir, files, errors: fileErrors, line: src.csv?.row.line }
      let data: Record<string, unknown>
      let parsed: Awaited<ReturnType<typeof parseFile>> | undefined
      let bodyLine: number | undefined
      if (src.csv) {
        data = {}
        const { columns, row } = src.csv
        columns.forEach((column, i) => {
          const cell = (row.cells[i] ?? '').trim()
          if (column === '' || column === 'slug' || column === 'locale' || cell === '') return
          const result = column === 'draft' ? cellValue({ draft: { type: 'boolean', label: 'draft' } }, column, cell) : cellValue(brick.fields, column, cell)
          if ('error' in result) fail(cx, column, result.error)
          else data[column] = result.value
        })
      } else {
        const text = await readFile(src.path, 'utf8')
        if (ext === 'md') {
          // Parsed once, with the file's frontmatter; the profile problems are reported by validate() on the body text.
          const field = markdownKey === undefined ? undefined : brick.fields[markdownKey]
          parsed = await parseFile(text, { profile: field?.type === 'markdown' ? effectiveProfile(field) : undefined, components: schema.components })
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
      // `draft` and `redirectFrom` are reserved: they are no fields of the brick.
      const { draft, redirectFrom, ...fields } = data
      const redirects = redirectFrom === undefined ? undefined : redirectPaths(cx, redirectFrom)
      if (draft !== undefined && typeof draft !== 'boolean') fail(cx, 'draft', '“draft” must be true or false.')
      if (draft === true && !drafts && fileErrors.length === 0) return 'draft'
      // A scheduled entry (dated after the build day) is left out like a draft; the first build on or after its date
      // publishes it. Only the main file holds the date.
      // Only a real ISO date schedules: any other text is left to validate(), which reports it. The entry is checked
      // like a published one (it goes live at a later build nobody watches) and left out of the bundle afterwards.
      const dateValue = dateKey === undefined ? undefined : fields[dateKey]
      const scheduled = isMain && !drafts && isDate(dateValue) && dateValue > today
      const view = convertFields(brick.fields, fields, cx)
      const hasBody = parsed !== undefined && parsed.value.nodes.length > 0
      if (parsed === undefined && markdownKey !== undefined) {
        const label = brick.fields[markdownKey]!.label
        fail(cx, markdownKey, `“${label}” is a markdown field: it is the text of a .md file, and ${ext === 'csv' ? 'CSV' : ext.toUpperCase()} files have no text.`)
      }
      if (parsed !== undefined && markdownKey !== undefined && hasBody) view[markdownKey] = parsed.body
      if (markdownKey === undefined && hasBody) fail(cx, 'body', `The text fits no field of “${key}” (it has no markdown field).`)
      // The slug defaults to the file name without its number (CONTENT.md "Slug"), for CSV to the `slug` cell.
      if (slugKey !== undefined && view[slugKey] === undefined) view[slugKey] = src.csv ? src.name : slugify(src.name)
      errors.push(...fileErrors)
      return fileErrors.length > 0 ? undefined : { view, tree: markdownKey !== undefined && hasBody ? parsed!.value : undefined, bodyLine, redirectFrom: redirects, draft: draft === true ? true : undefined, scheduled: scheduled ? true : undefined }
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

  return { entries, files, images, errors }
}

/** The field a file's body fills: the brick's markdown field. */
function markdownKeyOf(brick: Brick): string | undefined {
  return Object.keys(brick.fields).find((k) => brick.fields[k]!.type === 'markdown')
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

/** The brick's slug field, if it has one: the URL of each entry (CONTENT.md "Slug"). */
function slugKeyOf(brick: Brick): string | undefined {
  return brick.fields.slug?.type === 'slug' ? 'slug' : undefined
}

/**
 * The date field that schedules an entry: in a collection with drafts that lists its entries newest first by a date
 * (posts, a changelog), an entry dated after the build day is not published yet. A list in date order from the
 * oldest (events) shows coming dates on purpose, so it has none.
 */
function scheduleKeyOf(brick: Brick): string | undefined {
  if (brick.kind !== 'collection' || brick.drafts !== true || brick.order === 'manual' || brick.order.dir !== 'desc') return undefined
  return brick.fields[brick.order.field]?.type === 'date' ? brick.order.field : undefined
}

/** Problems that make every file of a brick unreadable: more than one markdown field. */
function brickProblemsOf(brick: Brick): { path?: string; message: string }[] {
  const problems: { path?: string; message: string }[] = []
  if (Object.values(brick.fields).filter((f) => f.type === 'markdown' && !f.retired).length > 1) {
    problems.push({ message: 'The file brick has more than one markdown field.' })
  }
  return problems
}
