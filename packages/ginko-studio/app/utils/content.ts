// Helpers for showing and editing stored values in the UI. The storage format is the server's
// (SPEC 2.2); these only translate it for people and back.
import { formatMoney, type Brick, type Field, type Fields, type Json, type Locale, type Task } from '@lupinum/ginko'
import { ordered, stableJson, type Schema } from '@lupinum/ginko/internal'
import { textIn } from '@lupinum/ginko-editor'
import { shownLabel } from './labels'
import type { Words } from './when'

export type Data = Record<string, Json>
export type { Task }

/** The name the entry's own input gives it (its week, or its first filled text field); undefined while nothing is typed. */
export function typedTitle(brick: Brick, data: Data, locale: Locale): string | undefined {
  // A week planned ahead is named by its week ("Woche ab 19.10.2026"), not by its note.
  if (brick.kind === 'collection' && brick.plans && typeof data[brick.plans.field] === 'string') {
    const day = new Date(`${data[brick.plans.field]}T00:00:00Z`)
    const field = brick.fields[brick.plans.field]
    if (field && !Number.isNaN(day.getTime())) return `${shownLabel(field.label, locale)} ${new Intl.DateTimeFormat(locale, { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' }).format(day)}`
  }
  for (const [key, field] of ordered(brick.fields)) {
    if (field.retired) continue
    if (field.type === 'text' || field.type === 'longtext') {
      const text = textIn(data[key], locale).trim()
      if (text) return text
    }
  }
  return undefined
}

/** A short name for an entry: its first text field in the main language, else the brick's label. */
export function titleOf(brick: Brick, data: Data, locale: Locale): string {
  return typedTitle(brick, data, locale) ?? shownLabel(brick.label, locale)
}

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

/** Lower case without accents, so "schnitz" finds "Schnitzel" and "kase" finds "Käse". */
export function searchable(text: string): string {
  return text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
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

/** Upload ids referenced anywhere in stored data (`{ file: id }` of image and file fields, in lists too). */
export function fileIdsIn(value: unknown, out: Set<string> = new Set()): Set<string> {
  if (Array.isArray(value)) for (const v of value) fileIdsIn(v, out)
  else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      if (k === 'file' && typeof v === 'string') out.add(v)
      else fileIdsIn(v, out)
    }
  }
  return out
}
