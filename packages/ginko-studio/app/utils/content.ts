// Helpers for showing and editing stored values in the UI. The storage format is the server's
// (SPEC 2.2); these only translate it for people and back.
import { formatMoney, type Brick, type CollectionBrick, type Field, type Fields, type Json, type Locale, type Task } from '@lupinum/ginko'
import { createAsks, entryTitle, fileRefsIn, isTranslatable, isVisible, leavesOf, ordered, printOf, slugBases, stableJson, untranslatedMode, urlsFor, weeklyTask, weekStartField, type Schema } from '@lupinum/ginko/internal'
import { textIn } from '@lupinum/ginko-editor'
import type { api } from '#convex/api'
import type { FunctionReturnType } from 'convex/server'
import { shownLabel } from './labels'
import type { Words } from './when'

export type Data = Record<string, Json>
export type { Task }

/**
 * The addresses a new entry will get, per slug field and language, read from the text each is made of as the server
 * reads it (entries.ts `slugsFor`, core `slugBases`): a language without its own text takes the main language's. The
 * server adds "-2" when an address is taken; the preview of an entry not saved yet does without.
 */
export function draftSlugs(brick: Brick, locales: readonly Locale[], data: Data): Data {
  const out: Data = {}
  for (const [name, field] of Object.entries(brick.fields)) {
    if (field.type !== 'slug' || field.retired) continue
    const from = data[field.from]
    const texts = Object.fromEntries(locales.map((locale) => {
      const text = from && typeof from === 'object' && !Array.isArray(from) ? from[locale] : undefined
      return [locale, typeof text === 'string' ? text : '']
    }))
    const bases = slugBases(locales, texts)
    out[name] = Object.fromEntries(locales.map((locale) => [locale, bases[locale] ?? bases[locales[0]!] ?? '']))
  }
  return out
}

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

/**
 * The fields a task shows: `edit` its fields; `create` every live field it asks for (`createAsks`: not the slug, and
 * not the plan of a planned change, which is made later with the task that changes the value).
 */
export function taskFields(brick: Brick, task: Task): Fields {
  const keys = task.kind === 'edit' ? task.fields : ordered(brick.fields).map(([k]) => k)
  const out: Fields = {}
  for (const key of keys) {
    const field = brick.fields[key]
    if (!field || field.retired) continue
    if (task.kind === 'create' && !createAsks(brick, key)) continue
    out[key] = field
  }
  return out
}

/** A field with text to translate: translatable itself, an image (alt text), or a list with such columns (Astra phase 8). */
export function hasTranslation(f: Field): boolean {
  if (f.type === 'list') return Object.values(f.of).some(hasTranslation)
  return (isTranslatable(f) && f.type !== 'slug') || f.type === 'image'
}

/**
 * The value at a leaf path: `name`, `image.alt`, or inside a list `days.<rowId>.dish` and
 * `images.<rowId>.image.alt` (the paths of the server's leavesOf and of the prints).
 */
export function leafValue(data: Record<string, unknown> | undefined, path: string): unknown {
  const [root, ...rest] = path.split('.')
  let value: unknown = data?.[root!]
  if (rest.length && rest[0] !== 'alt') {
    const [rowId, column, ...tail] = rest
    const row = Array.isArray(value) ? value.find((r) => (r as { _id?: string })._id === rowId) : undefined
    value = (row as Record<string, unknown> | undefined)?.[column!]
    if (tail[0] === 'alt') value = (value as { alt?: unknown } | undefined)?.alt
  } else if (rest[0] === 'alt') {
    value = (value as { alt?: unknown } | undefined)?.alt
  }
  return value
}

const isRecord = (value: unknown): value is Record<string, Json> => typeof value === 'object' && value !== null && !Array.isArray(value)
const same = (a: unknown, b: unknown) => stableJson(a ?? null) === stableJson(b ?? null)

/** `theirs` with the languages that differ between `base` and `mine` taken from `mine` (absent there: removed). */
function textsOver(base: Record<string, Json>, mine: Record<string, Json>, theirs: Json | undefined): Record<string, Json> {
  const out = { ...(isRecord(theirs) ? theirs : {}) }
  for (const l of new Set([...Object.keys(base), ...Object.keys(mine)])) {
    if (same(base[l], mine[l])) continue
    if (mine[l] === undefined) delete out[l]
    else out[l] = mine[l]
  }
  return out
}

/**
 * The person's own changes to one root field (`base` → `mine`) over someone else's newer value (`theirs`), for "Meine
 * behalten" and for a restored local copy. A form that saves every language sends whole texts, so a text keeps the
 * languages the person did not change, also in a list row both still have and in a photo description. Everything else
 * (a number, the photo itself, which rows a list has and their order) comes from `mine`, as it always did.
 */
export function ownChangesOver(field: Field, base: Json | undefined, mine: Json | undefined, theirs: Json | undefined): Json | undefined {
  if (isTranslatable(field)) {
    if (!isRecord(base) || !isRecord(mine)) return mine
    const texts = textsOver(base, mine, theirs)
    return Object.keys(texts).length ? texts : undefined
  }
  if (field.type === 'image' && isRecord(mine) && isRecord(base) && isRecord(mine.alt) && isRecord(base.alt)) {
    return { ...mine, alt: textsOver(base.alt, mine.alt, isRecord(theirs) ? theirs.alt : undefined) }
  }
  if (field.type === 'list' && Array.isArray(mine) && Array.isArray(base) && Array.isArray(theirs)) {
    const byId = (rows: Json[]) => new Map(rows.filter(isRecord).map((row) => [row._id, row]))
    const [was, now] = [byId(base), byId(theirs)]
    return mine.map((row) => {
      const b = isRecord(row) ? was.get(row._id) : undefined
      const t = isRecord(row) ? now.get(row._id) : undefined
      if (!isRecord(row) || !b || !t) return row
      const out: Record<string, Json> = { ...row }
      for (const [key, inner] of Object.entries(field.of)) {
        const value = ownChangesOver(inner, b[key], row[key], t[key])
        if (value === undefined) delete out[key]
        else out[key] = value
      }
      return out
    })
  }
  return mine
}

/**
 * The languages of the texts that `after` sets differently from `before` (root fields of `fields`, a text in a list row,
 * a photo description). A text of a removed row does not count: it goes in every language with its row.
 */
export function changedTextLanguages(fields: Fields, before: Data, after: Data): Set<string> {
  const out = new Set<string>()
  for (const [key, value] of Object.entries(after)) {
    const field = fields[key]
    if (!field) continue
    const was = leavesOf(field, before[key], key)
    for (const [leaf, now] of leavesOf(field, value, key)) {
      const old = was.get(leaf) ?? {}
      for (const l of new Set([...Object.keys(old), ...Object.keys(now)])) if (!same(old[l], now[l])) out.add(l)
    }
  }
  return out
}

/** A week shortcut of a date field, as weeks after this work week: 0 this week, 1 next week, 2 the week after. */
export type WeekOffset = 0 | 1 | 2

/**
 * The week shortcuts of the date field `key`, when it holds a week start (core `weekStartField`); undefined for any
 * other date (it gets Heute/Morgen). A planned week is ahead (next week, the week after), the weekly single's week is
 * this one, any other week start this week or next.
 */
export function weekShortcuts(brick: Brick, key: string): readonly WeekOffset[] | undefined {
  if (weekStartField(brick) !== key) return undefined
  if (brick.kind === 'collection' && brick.plans) return [1, 2]
  if (brick.kind === 'single' && weeklyTask(brick)?.field === key) return [0]
  return [0, 1]
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

/** The language name standing alone (a heading, a button): capitalized, also where the language writes it in lower case ("Inglés"). */
export function languageLabel(locale: string, language: string): string {
  const name = languageName(locale, language)
  return name.charAt(0).toLocaleUpperCase(language) + name.slice(1)
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

/**
 * A foreign language's state of the stored entry, as `entries.get` sends it (server lib/translation.ts `LeafStatus`):
 * missing and outdated texts, the missing ones its page waits for, and what the website shows (`page`).
 */
export type StoredTranslation = NonNullable<FunctionReturnType<typeof api.entries.get>>['translation'][string]

/** What the website shows of an entry in a foreign language: nothing yet (`hidden`), a link to its main-language page (`mainPage`), or the entry (`shown`). */
export type TranslationPage = StoredTranslation['page']

/**
 * The page of an entry in one language (the address line of a translation): none while the entry has no page there
 * (its required texts are not translated yet); `online` only while the website shows it: the site has a release, the
 * entry is no draft, and its date has not passed (`today` in the site's zone, core isVisible).
 */
export function pageOf(
  schema: Schema, key: string, brick: CollectionBrick, entry: { _id: string; data: Data; prints?: Record<string, Record<string, string>>; state?: 'draft' | 'live' },
  locale: Locale, site: { released: boolean; today: string },
): { path: string; online: boolean } | undefined {
  const path = urlsFor(schema, key, brick, { id: entry._id, data: entry.data, prints: entry.prints })[locale]
  if (!path) return undefined
  return { path, online: site.released && entry.state !== 'draft' && isVisible(brick, entry.data, site.today) }
}

/** The language names the translation notes use: the foreign one (`lang`) and the main one, in the Studio's language. */
export interface LanguageNames { lang: string; main: string }

/**
 * The note under a field whose translation is missing, from the stored state (what the website shows now). Without
 * one (a draft) it only says so; on a page that is not online in the language, it names the texts the page waits for.
 */
export function missingNote(stored: StoredTranslation | undefined, leaf: string, t: Words['t'], names: LanguageNames): string {
  if (!stored) return t('fields.translation.notTranslated')
  if (stored.page === 'shown') return t('fields.translation.notTranslatedShowsMain', { name: names.main })
  return stored.blocking.includes(leaf) ? t('fields.translation.notTranslatedBlocks', { lang: names.lang }) : t('fields.translation.notTranslated')
}

/** The lines under the language switch: whether the page is online in this language, and what shows where a text is missing or outdated. */
export function translationLines(stored: StoredTranslation | undefined, t: Words['t'], names: LanguageNames): string[] {
  if (!stored) return []
  if (stored.page === 'hidden') return [t('entry.translationState.hidden', { lang: names.lang })]
  if (stored.page === 'mainPage') return [t('entry.translationState.mainPage', { lang: names.lang, main: names.main })]
  return [
    ...(stored.missing.length ? [t('entry.translationState.missing', { lang: names.lang, main: names.main })] : []),
    ...(stored.outdated.length ? [t('entry.translationState.outdated', { lang: names.lang, main: names.main })] : []),
  ]
}

/** One language in the answer of a save, create or publish (server lib/translation.ts `translationNotes`). */
export type TranslationNote = Extract<FunctionReturnType<typeof api.entries.create>, { translation: unknown }>['translation'][number]

/**
 * The sentences the message after a save adds about the other languages: one per kind, the languages of a kind
 * named together ("Englisch und Französisch"). A language counts once, for its most important kind: a page that is
 * not online, then a link to the main-language page, then missing texts, then outdated ones. `language` is the
 * Studio's language, `main` the site's main locale.
 */
export function translationNote(notes: readonly TranslationNote[] | undefined, t: Words['t'], language: string, main: string): string {
  const kinds = { hidden: [] as string[], mainPage: [] as string[], missing: [] as string[], outdated: [] as string[] }
  for (const note of notes ?? []) {
    const kind = note.page !== 'shown' ? note.page : note.missing ? 'missing' : note.outdated ? 'outdated' : undefined
    if (kind) kinds[kind].push(languageName(note.locale, language))
  }
  const list = (names: string[]) => {
    try {
      return new Intl.ListFormat(language, { type: 'conjunction' }).format(names)
    } catch {
      return names.join(', ')
    }
  }
  const mainName = languageName(main, language)
  return (Object.entries(kinds) as [keyof typeof kinds, string[]][])
    .filter(([, names]) => names.length)
    .map(([kind, names]) => t(`ops.translation.${kind}`, { langs: list(names), main: mainName }))
    .join(' ')
}

const isEmpty = (value: unknown) => value === undefined || value === null || value === ''

/**
 * Translation state of one leaf in a foreign language: `missing` when the main language has a text and this language
 * has none, `stale` when the stored translation was made for an older main-language text (its print no longer
 * matches), else `fine`. A leaf that is empty in the main language too has nothing to translate. `confirmed`: the
 * person said the translation fits as it is. A text typed here (`draft` differs from `storedForeign`) is saved as a
 * fresh translation, so only an untouched stored one can be stale.
 */
export function leafTranslation(input: { draft: Record<string, unknown> | undefined; locale: string; main: string; storedMain: unknown; storedForeign: unknown; print: string | undefined; confirmed: boolean }): 'missing' | 'stale' | 'fine' {
  if (isEmpty(input.draft?.[input.locale])) return isEmpty(input.draft?.[input.main]) ? 'fine' : 'missing'
  if (input.confirmed || input.draft?.[input.locale] !== input.storedForeign) return 'fine'
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
