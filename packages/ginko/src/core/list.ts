// Names, search and sort of the Studio's entry lists. The platform's list query (ginko-server entries.list) and the
// Studio use these same functions, so a list the server narrows and sorts matches what the Studio showed before.
import { labelOf } from './labels.ts'
import { ordered } from './schema.ts'
import type { Brick, Label, Locale } from './types.ts'

type Data = Record<string, unknown>

/** The text of a translatable value in one locale, or the plain value when it is not localized. */
export function textIn(value: unknown, locale: Locale): string {
  if (typeof value === 'string') return value
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const v = (value as Record<string, unknown>)[locale]
    return typeof v === 'string' ? v : ''
  }
  return ''
}

/** Lower case without accents, so "schnitz" finds "Schnitzel" and "kase" finds "Käse". */
export function searchable(text: string): string {
  return text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
}

/**
 * The name the entry's own input gives it: a week planned ahead by its week ("Woche ab 19.10.2026"), else its first
 * filled text or longtext field in `locale`; undefined while nothing is typed. `label` words the week's field label
 * for the reader (default: in `locale`).
 */
export function entryTitle(brick: Brick, data: Data, locale: Locale, label: (label: Label) => string = (l) => labelOf(l, locale, locale)): string | undefined {
  if (brick.kind === 'collection' && brick.plans && typeof data[brick.plans.field] === 'string') {
    const day = new Date(`${data[brick.plans.field] as string}T00:00:00Z`)
    const field = brick.fields[brick.plans.field]
    if (field && !Number.isNaN(day.getTime())) return `${label(field.label)} ${new Intl.DateTimeFormat(locale, { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' }).format(day)}`
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

/** All words of an entry's text and longtext fields in every language, in `searchable` form: what a list search matches. */
export function listHaystack(brick: Brick, data: Data, locales: readonly string[]): string {
  const parts: string[] = []
  for (const [key, field] of ordered(brick.fields)) {
    if (field.retired || (field.type !== 'text' && field.type !== 'longtext')) continue
    for (const locale of locales) parts.push(textIn(data[key], locale))
  }
  return searchable(parts.join(' '))
}

/** The comparable value of a field: text in the main language, a number, or a date string. */
function sortKey(field: Brick['fields'][string], value: unknown, main: string): string | number {
  if (value === undefined || value === null) return ''
  switch (field.type) {
    case 'number': return Number(value)
    case 'money': return (value as { amount: number }).amount
    case 'daterange': return (value as { from: string }).from
    case 'date': return String(value)
    default: return searchable(textIn(value, main))
  }
}

/** A list sorted by one field (a saved view's sort), as a copy. Entries without a value come last, in either direction. */
export function listSort<T extends { data: Data }>(rows: readonly T[], brick: Brick, sort: { field: string; dir: 'asc' | 'desc' }, main: string): T[] {
  const field = Object.hasOwn(brick.fields, sort.field) ? brick.fields[sort.field] : undefined
  if (!field) return [...rows]
  const sign = sort.dir === 'asc' ? 1 : -1
  return [...rows].sort((a, b) => {
    const x = sortKey(field, a.data[sort.field], main)
    const y = sortKey(field, b.data[sort.field], main)
    if (x === '') return y === '' ? 0 : 1
    if (y === '') return -1
    return sign * (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y)))
  })
}
