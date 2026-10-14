// Pure content rules of the write path (SPEC part 3 "Übersetzungs-Abdrücke", 4.2 save).
// No Convex here, so every rule is testable with plain data.
import type { Field, Fields, Json, Label, Locale } from '@lupinum/ginko'
import { effectiveAlt, fileImagesWithoutAlt, fileRefsIn, isTranslatable, markdownTrees, printOf, stableJson, type Schema } from '@lupinum/ginko/internal'

export type Data = Record<string, Json>
export type Prints = Record<string, Record<string, string>>

/**
 * Replaces one root field. With `locale`, translatable leaves are taken only in that
 * locale from `next`; every other locale keeps its stored value. A leaf whose `next` has no
 * entry for `locale` stays as stored; `null` or "" removes that locale's value. List rows are
 * matched by `_id`; the row structure (order, added, removed rows) comes from `next`.
 * Returns undefined when nothing is left of the field.
 */
export function mergeField(field: Field, stored: Json | undefined, next: Json, locale: Locale | undefined): Json | undefined {
  // A whole-field save follows the same rule as a save in one language: null or "" removes that language.
  if (!locale) return isTranslatable(field) && isRecord(next) ? withoutEmpty(next) : next
  if (isTranslatable(field)) return mergeLocalized(stored, next, locale)
  if (field.type === 'image' && isRecord(next)) {
    return { ...next, alt: mergeLocalized(asRecord(stored).alt, next.alt, locale) ?? {} } as Json
  }
  if (field.type === 'list' && Array.isArray(next)) {
    const oldRows = new Map((Array.isArray(stored) ? stored : []).filter(isRecord).map((r) => [r._id, r]))
    return next.map((row) => {
      if (!isRecord(row)) return row
      const old = oldRows.get(row._id)
      const out: Record<string, Json> = { ...row }
      for (const [key, inner] of Object.entries(field.of)) {
        if (row[key] === undefined) continue
        const merged = mergeField(inner, old?.[key], row[key]!, locale)
        if (merged === undefined) delete out[key]
        else out[key] = merged
      }
      return out as Json
    })
  }
  return next
}

/** A localized value without its null and "" entries; undefined when no language is left. */
function withoutEmpty(value: Record<string, Json>): Json | undefined {
  const kept = Object.entries(value).filter(([, v]) => v !== null && v !== '')
  return kept.length ? Object.fromEntries(kept) : undefined
}

/** `stored` with the entry of `locale` taken from `next`: absent stays, null or "" removes it. */
function mergeLocalized(stored: Json | undefined, next: Json | undefined, locale: Locale): Json | undefined {
  const sent = asRecord(next)
  if (!Object.hasOwn(sent, locale)) return stored
  const merged = { ...asRecord(stored) }
  if (sent[locale] === null || sent[locale] === '') delete merged[locale]
  else merged[locale] = sent[locale]!
  return Object.keys(merged).length ? merged : undefined
}

/** A Localized value without one language, or undefined when nothing is left (a field cleared in that language only). */
export function withoutLocale(stored: Json | undefined, locale: Locale): Json | undefined {
  const { [locale]: _removed, ...rest } = asRecord(stored)
  return Object.keys(rest).length ? rest : undefined
}

/** Every translatable leaf of a root field: path → Localized value. Paths match resolveEntry's fallback paths. */
export function leavesOf(field: Field, value: Json | undefined, path: string, out: Map<string, Record<string, Json>> = new Map()) {
  if (value === undefined || value === null) return out
  if (isTranslatable(field)) out.set(path, asRecord(value))
  else if (field.type === 'image') out.set(`${path}.alt`, asRecord(asRecord(value).alt))
  else if (field.type === 'list' && Array.isArray(value)) {
    for (const row of value) {
      if (!isRecord(row)) continue
      for (const [key, inner] of Object.entries(field.of)) leavesOf(inner, row[key], `${path}.${String(row._id)}.${key}`, out)
    }
  }
  return out
}

/**
 * New prints for the changed roots. A foreign leaf that changed in this save, or is listed
 * in `confirm` for `locale`, gets the print of its current main value. Unchanged foreign
 * leaves keep their print, even when the whole value was sent. Prints of leaves that no
 * longer exist (removed rows, removed fields) are dropped.
 */
export function nextPrints(input: {
  fields: Fields
  roots: string[]
  before: Data
  after: Data
  prints: Prints
  main: Locale
  confirm: { locale: Locale; leaves: string[] } | undefined
}): Prints {
  const out: Prints = {}
  const touched = (leaf: string) => input.roots.some((r) => leaf === r || leaf.startsWith(`${r}.`))
  for (const [leaf, byLocale] of Object.entries(input.prints)) if (!touched(leaf)) out[leaf] = { ...byLocale }
  for (const root of input.roots) {
    const field = input.fields[root]
    if (!field) continue
    const old = leavesOf(field, input.before[root], root)
    const now = leavesOf(field, input.after[root], root)
    for (const [leaf, values] of now) {
      const kept = { ...(input.prints[leaf] ?? {}) }
      const print = printOf(values[input.main])
      for (const [locale, value] of Object.entries(values)) {
        if (locale === input.main) continue
        if (stableJson(old.get(leaf)?.[locale] ?? null) !== stableJson(value ?? null)) kept[locale] = print
      }
      if (input.confirm?.leaves.includes(leaf)) kept[input.confirm.locale] = print
      // A removed translation has no print any more.
      for (const locale of Object.keys(kept)) if (values[locale] === undefined || values[locale] === null) delete kept[locale]
      if (Object.keys(kept).length) out[leaf] = kept
    }
  }
  return out
}

/** The root field of a leaf path (`days.k3Fd9aZ0qx.dish` → `days`). */
export function rootOf(leaf: string): string {
  return leaf.split('.')[0]!
}

/**
 * Whether a `$file.<id>` of a Markdown text has the form of an upload ID (on the server: `ctx.db.normalizeId('uploads', id)`).
 * A shell example like `backup="$file.bak"` stands where a reference may stand but names no upload: it is text, not a
 * reference, so it never reaches a `fileRefs` row or the file check.
 */
export type IsUploadId = (id: string) => boolean

/**
 * Upload IDs referenced anywhere in a value: image and file fields store `{ file }`, Markdown texts hold `$file.<id>`
 * (those `isUploadId` accepts). `only` keeps those of one field type (no Markdown references).
 */
export function fileIdsOf(fields: Fields, data: Data, which: { isUploadId: IsUploadId } | { only: 'image' | 'file' }): Set<string> {
  const only = 'only' in which ? which.only : undefined
  const ids = new Set<string>()
  const walk = (field: Field, value: Json | undefined) => {
    if (value === undefined || value === null) return
    if ((field.type === 'image' || field.type === 'file') && (!only || field.type === only) && typeof asRecord(value).file === 'string') ids.add(asRecord(value).file as string)
    if (field.type === 'markdown' && 'isUploadId' in which) for (const text of textsOf(value)) for (const id of fileRefsIn(text)) if (which.isUploadId(id)) ids.add(id)
    if (field.type === 'list' && Array.isArray(value)) for (const row of value) for (const [k, inner] of Object.entries(field.of)) walk(inner, asRecord(row)[k])
  }
  for (const [name, field] of Object.entries(fields)) walk(field, data[name])
  return ids
}

/** One place where an entry uses a file: the path in the entry (list rows by their `_id`) and whether an image lacks its description in any language. */
export interface Use { path: string; missingAlt: boolean }

/**
 * Every use of a file in an entry, by upload ID. The same walk as `fileIdsOf`, so the file
 * references and their `uses` can never disagree. An image needs an effective description (its own text, else the library text) in each
 * of the site's `locales`; a file (PDF) has none. A Markdown text that references a file is one use at the text's
 * path; it lacks a description where a language's text shows the file as `![]($file.<id>)` and the library has no
 * text for that language.
 */
export function usesOf(fields: Fields, data: Data, locales: readonly Locale[], isUploadId: IsUploadId, fileAlt?: (file: string) => Record<string, string> | undefined): Map<string, Use[]> {
  const out = new Map<string, Use[]>()
  const walk = (path: string, field: Field, value: Json | undefined) => {
    if (value === undefined || value === null) return
    if (field.type === 'image' || field.type === 'file') {
      const file = asRecord(value).file
      if (typeof file !== 'string') return
      const alt = asRecord(value).alt
      const library = fileAlt?.(file)
      const missingAlt = field.type === 'image' && locales.some((l) => !effectiveAlt(alt, library, l))
      out.set(file, [...(out.get(file) ?? []), { path, missingAlt }])
    }
    if (field.type === 'markdown') {
      // A text for every language (translate: false) is checked against each of them.
      const texts: [readonly Locale[], string][] = typeof value === 'string' ? [[locales, value]] : Object.entries(asRecord(value)).flatMap(([l, t]) => (typeof t === 'string' && locales.includes(l) ? [[[l], t] as [Locale[], string]] : []))
      const files = new Set(texts.flatMap(([, text]) => [...fileRefsIn(text)]).filter(isUploadId))
      for (const file of files) {
        const library = fileAlt?.(file)
        const missingAlt = texts.some(([langs, text]) => fileImagesWithoutAlt(text).has(file) && langs.some((l) => !effectiveAlt(undefined, library, l)))
        out.set(file, [...(out.get(file) ?? []), { path, missingAlt }])
      }
    }
    if (field.type === 'list' && Array.isArray(value)) {
      value.forEach((row, i) => {
        const key = typeof asRecord(row)._id === 'string' ? (asRecord(row)._id as string) : String(i)
        for (const [k, inner] of Object.entries(field.of)) walk(`${path}.${key}.${k}`, inner, asRecord(row)[k])
      })
    }
  }
  for (const [name, field] of Object.entries(fields)) walk(name, field, data[name])
  return out
}

/** The value at a path written by `usesOf`. */
export function valueAt(data: Data, path: string): Json | undefined {
  let current: Json | undefined = data
  for (const key of path.split('.')) {
    if (Array.isArray(current)) current = current.find((row, i) => asRecord(row)._id === key || (typeof asRecord(row)._id !== 'string' && String(i) === key))
    else if (isRecord(current)) current = current[key]
    else return undefined
  }
  return current
}

/** An entry ID in a `ref` field: its root field, its content path (`author`, `credits.<row id>.who`) and the brick it points to. */
export interface RefId { root: string; path: string; to: string; id: string }

/** Every entry ID the `ref` fields of `data` hold: a single ID, a list with `multiple`, also in list rows. */
export function refIdsIn(fields: Fields, data: Data): RefId[] {
  const out: RefId[] = []
  const walk = (root: string, path: string, field: Field, value: Json | undefined) => {
    if (field.type === 'ref') for (const id of [value].flat()) if (typeof id === 'string') out.push({ root, path, to: field.to, id })
    if (field.type === 'list' && Array.isArray(value)) {
      value.forEach((row, i) => {
        if (!isRecord(row)) return
        // Rows are named by `_id` like `usesOf` and `valueAt`; a row without one by its index.
        const key = typeof row._id === 'string' ? row._id : String(i)
        for (const [k, inner] of Object.entries(field.of)) walk(root, `${path}.${key}.${k}`, inner, row[k])
      })
    }
  }
  for (const [name, field] of Object.entries(fields)) walk(name, name, field, data[name])
  return out
}

/** The label of the field at a content path (`hero`, `rows.<id>.image`): the leaf field's own label, so a use reads "Title image" and not a path. */
export function fieldLabelAt(schema: Schema, brick: string, path: string): Label | null {
  let fields: Fields | undefined = Object.hasOwn(schema.bricks, brick) ? schema.bricks[brick]!.fields : undefined
  let label: Label | null = null
  const keys = path.split('.')
  for (let i = 0; fields && i < keys.length; i++) {
    const field: Field | undefined = Object.hasOwn(fields, keys[i]!) ? fields[keys[i]!] : undefined
    if (!field) return label
    label = field.label
    if (field.type === 'list' && i + 2 < keys.length) {
      fields = field.of
      i += 1
    } else fields = undefined
  }
  return label
}

/**
 * The data with every entry ID of a `ref` field (a single ID, or a list with `multiple`, also in list rows)
 * found in `map` replaced by its new ID. Unknown IDs stay as they are. Entry references live only in `data`;
 * no index table repeats them.
 */
export function remapEntryRefs(fields: Fields, data: Data, map: ReadonlyMap<string, string>): Data {
  const swap = (id: Json): Json => (typeof id === 'string' ? (map.get(id) ?? id) : id)
  const walk = (field: Field, value: Json | undefined): Json | undefined => {
    if (value === undefined || value === null) return value
    if (field.type === 'ref') return Array.isArray(value) ? value.map(swap) : swap(value)
    if (field.type === 'list' && Array.isArray(value)) {
      return value.map((row) => {
        if (!isRecord(row)) return row
        const out: Record<string, Json> = { ...row }
        for (const [key, inner] of Object.entries(field.of)) if (out[key] !== undefined) out[key] = walk(inner, out[key])!
        return out
      })
    }
    return value
  }
  const out: Data = { ...data }
  for (const [name, field] of Object.entries(fields)) if (out[name] !== undefined) out[name] = walk(field, out[name])!
  return out
}

/**
 * The trees of an entry's Markdown texts as JSON text, which the bundle serves (`entryTrees` in schema.ts, lib/trees.ts),
 * and their UTF-8 size. '' and 0 when the entry has no Markdown text. The trees do not count toward an entry's budget
 * (core `entryBytes`); their size only feeds the site's `treeBytes` guard.
 */
export async function treesOf(fields: Fields, data: Data): Promise<{ json: string; bytes: number }> {
  const trees = await markdownTrees(fields, data)
  const json = Object.keys(trees).length ? JSON.stringify(trees) : ''
  return { json, bytes: new TextEncoder().encode(json).byteLength }
}

/** The texts of a Markdown value: one string, or one per language. */
function textsOf(value: Json): string[] {
  return typeof value === 'string' ? [value] : Object.values(asRecord(value)).filter((text): text is string => typeof text === 'string')
}

function isRecord(v: unknown): v is Record<string, Json> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function asRecord(v: unknown): Record<string, Json> {
  return isRecord(v) ? v : {}
}
