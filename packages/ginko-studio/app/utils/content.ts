// Helpers for showing and editing stored values in the UI. The storage format is the server's
// (SPEC 2.2); these only translate it for people and back.
import { formatMoney, type Brick, type Field, type Fields, type Json, type Locale, type Task } from '@lupinum/ginko'
import { entryTitle, fileRefsIn, isTranslatable, ordered, printOf, stableJson, untranslatedMode, type Schema } from '@lupinum/ginko/internal'
import { textIn } from '@lupinum/ginko-editor'
import { shownLabel } from './labels'
import type { Words } from './when'

export type Data = Record<string, Json>
export type { Task }

/** A short name for an entry: its first text field in the main language, else the brick's label. */
export function titleOf(brick: Brick, data: Data, locale: Locale): string {
  return typedTitle(brick, data, locale) ?? shownLabel(brick.label, locale)
}

/** The name the entry's own input gives it (core `entryTitle`, labels for the person); undefined while nothing is typed. */
export const typedTitle = (brick: Brick, data: Data, locale: Locale): string | undefined => entryTitle(brick, data, locale, (label) => shownLabel(label, locale))

/** The publish panel's question about what was typed, new entry or edited: "Wann soll „Herbstfest“ online gehen?". */
export function publishQuestion(brick: Brick, data: Data, locale: Locale, t: Words['t']): string {
  const name = typedTitle(brick, data, locale)
  return name ? t('entry.publish.whenOnline', { title: name }) : t('entry.publish.whenOnlineUntitled')
}

/** The name of a list row: its first filled text or choice column ("Dienstag", a dish). `key` tells which column it is. */
export function rowTitle(columns: Fields, row: unknown, locale: Locale, words: Words): { key: string; text: string } | undefined {
  if (!row || typeof row !== 'object') return undefined
  for (const [key, field] of ordered(columns)) {
    if (field.retired || (field.type !== 'text' && field.type !== 'longtext' && field.type !== 'choice')) continue
    const value = (row as Record<string, unknown>)[key]
    if (value === undefined || value === null || value === '') continue
    const text = displayValue(field, value, locale, words).trim()
    if (text) return { key, text }
  }
  return undefined
}

/** The first choice field of a brick, used to group pick lists (Kategorie). */
export function groupField(brick: Brick): { key: string; field: Extract<Field, { type: 'choice' }> } | undefined {
  for (const [key, field] of ordered(brick.fields)) {
    if (field.type === 'choice' && !field.retired) return { key, field }
  }
  return undefined
}

/** Root fields whose value differs between two data objects. */
export function changedRoots(before: Data, after: Data): string[] {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)])
  return [...keys].filter((k) => stableJson(before[k] ?? null) !== stableJson(after[k] ?? null))
}

/** The fields a task shows: `edit` its fields; `create` every live field except the slug. */
export function taskFields(brick: Brick, task: Task): Fields {
  const keys = task.kind === 'edit' ? task.fields : ordered(brick.fields).map(([k]) => k)
  const out: Fields = {}
  for (const key of keys) {
    const field = brick.fields[key]
    if (!field || field.retired) continue
    if (task.kind === 'create' && field.type === 'slug') continue
    out[key] = field
  }
  return out
}

/** "brick.task" (SPEC 2.7 TaskRef). */
export const taskRef = (brick: string, task: Task) => `${brick}.${task.id}`

export function mainLocaleOf(schema: Schema): Locale {
  return schema.locales[0]!
}

/** A value as a short text for people (conflict notes, summaries). `words` is the Studio's `useI18n()` (t, format). */
export function displayValue(field: Field, value: unknown, locale: Locale, words: Words): string {
  const { t, format } = words
  if (value === undefined || value === null || value === '') return t('ops.value.empty')
  switch (field.type) {
    case 'text': case 'longtext': case 'slug': return textIn(value, locale) || t('ops.value.empty')
    case 'money': return formatMoney({ amount: (value as { amount: number }).amount, currency: field.currency ?? 'EUR' }, locale)
    case 'boolean': return value ? t('ops.value.yes') : t('ops.value.no')
    case 'date': return formatDay(String(value), format)
    case 'daterange': { const r = value as { from: string; to: string }; return r.from === r.to ? formatDay(r.from, format) : `${formatDay(r.from, format)} – ${formatDay(r.to, format)}` }
    case 'choice': { const o = field.options.find((x) => x.value === value); return o ? shownLabel(o.label, locale) : String(value) }
    case 'choices': { const v = value as string[]; return v.length ? field.options.filter((o) => v.includes(o.value)).map((o) => shownLabel(o.label, locale)).join(', ') : t('ops.value.none') }
    case 'list': return t('ops.value.items', { count: (value as unknown[]).length })
    case 'number': return `${format.number(Number(value), { useGrouping: false, maximumFractionDigits: 20 })}${field.unit ? ` ${field.unit}` : ''}`
    default: return t('ops.value.changed')
  }
}

/** 2026-10-08 → 8.10.2026 in German, 10/8/2026 in English: a calendar date, so no time zone shifts it. */
export function formatDay(date: string, format: Words['format']): string {
  const [y, m, d] = date.split('-')
  return y && m && d ? format.date(date, { day: 'numeric', month: 'numeric', year: 'numeric' }) : date
}

/**
 * The date that matters for an entry in a list: the field that decides when it is visible, else its first
 * date field. A range shows "von – bis". Undefined when the entry has none, it is empty, or the title names it.
 */
export function relevantDate(brick: Brick, data: Data, words: Words): string | undefined {
  // A planned week carries its date in its name already (`titleOf`).
  if (brick.kind === 'collection' && brick.plans) return undefined
  const visible = brick.kind === 'collection' && brick.visible && brick.visible.mode !== 'always' ? brick.visible.field : undefined
  const key = visible ?? ordered(brick.fields).find(([, f]) => !f.retired && (f.type === 'date' || f.type === 'daterange'))?.[0]
  const field = key ? brick.fields[key] : undefined
  if (!key || !field || (field.type !== 'date' && field.type !== 'daterange')) return undefined
  const value = data[key]
  if (value === undefined || value === null || value === '') return undefined
  return displayValue(field, value, 'de', words)
}

/** "de" → "German" (en) or "Deutsch" (de): language names in the Studio's language (`language`, e.g. `en-GB`). */
export function languageName(locale: string, language: string): string {
  try {
    return new Intl.DisplayNames(language, { type: 'language' }).of(locale) ?? locale
  } catch {
    return locale
  }
}

/**
 * Upload ids referenced anywhere in stored data: `{ file: id }` of image and file fields and, with `texts`, `$file.<id>`
 * in Markdown texts, in lists too.
 */
function fileIdsIn(value: unknown, out: Set<string>, texts: boolean): Set<string> {
  if (typeof value === 'string') { if (texts) for (const id of fileRefsIn(value)) out.add(id) }
  else if (Array.isArray(value)) for (const v of value) fileIdsIn(v, out, texts)
  else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      if (k === 'file' && typeof v === 'string') out.add(v)
      else fileIdsIn(v, out, texts)
    }
  }
  return out
}

/** How many files one `uploads.urls` query answers. */
const MAX_FILES = 200

/**
 * The files the preview asks for: it shows any page of the site, so in principle every file of every entry. One query
 * answers at most `MAX_FILES`, so the most likely shown come first: the open entry's own (`draft`), then the image and
 * file fields of the other entries (lists show them), then the pictures in their texts (only their own page shows them).
 */
export function previewFileIds(draft: unknown, entries: readonly unknown[]): string[] {
  const ids = fileIdsIn(draft, new Set(), true)
  fileIdsIn(entries, ids, false)
  fileIdsIn(entries, ids, true)
  return [...ids].slice(0, MAX_FILES)
}

const isEmpty = (value: unknown) => value === undefined || value === null || value === ''

/**
 * Translation state of one leaf in a foreign language: `missing` when the main language has a text and this language
 * has none, `stale` when the main-language text changed since the translation (its print no longer matches), else
 * `fine`. A leaf that is empty in the main language too has nothing to translate. `confirmed`: the person said the
 * translation fits as it is.
 */
export function leafTranslation(input: { draft: Record<string, unknown> | undefined; locale: string; main: string; storedMain: unknown; print: string | undefined; confirmed: boolean }): 'missing' | 'stale' | 'fine' {
  if (isEmpty(input.draft?.[input.locale])) return isEmpty(input.draft?.[input.main]) ? 'fine' : 'missing'
  if (input.confirmed) return 'fine'
  return input.storedMain !== undefined && input.print !== printOf(input.storedMain) ? 'stale' : 'fine'
}


/**
 * Whether the website leaves the whole entry out of a language while this leaf has no text there (`name`, `image.alt`,
 * or `days.<rowId>.dish` in a list). It mirrors core resolve.ts `localized()`: a required text of a collection whose
 * untranslated entries are hidden (`untranslatedMode`, pages by default) makes the entry untranslated; slugs and image
 * descriptions never do, and parts of pages fall back to the main language instead.
 */
export function hidesUntranslated(brick: Brick, leaf: string): boolean {
  if (brick.kind !== 'collection' || untranslatedMode(brick) !== 'hide' || leaf.endsWith('.alt')) return false
  const [root, , column] = leaf.split('.')
  const top = brick.fields[root!]
  const field = column === undefined ? top : top?.type === 'list' ? top.of[column] : undefined
  return !!field && isTranslatable(field) && !field.optional && field.type !== 'slug'
}
