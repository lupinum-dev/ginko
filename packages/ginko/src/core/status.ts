// The status line of a brick on the Studio's Today page (`status` on a brick, UI.md 3) and whether its section is due.
// The platform computes it from the live entries; the Studio shows it and the weekly reminder mails the due ones.
import { isTranslatable } from './fields.ts'
import { entryTitle, textIn } from './list.ts'
import { isVisible, visibleUntil } from './resolve.ts'
import { addDays } from './time.ts'
import type { Brick, Field, Json, Locale } from './types.ts'

/**
 * Today's opening hours of a single with `status: { hours: true }`: closed, open in `ranges` (`['11:30', '14:30']`), or
 * unknown (the rules give no answer for today, which makes the section due).
 */
export type HoursToday = { closed: true } | { ranges: readonly (readonly [string, string])[] } | { unknown: true }

/**
 * What the status line says. Titles are in the site's main language (null while an entry has none: the Studio shows the
 * brick's label), dates are `YYYY-MM-DD`, `field` is the field's name.
 */
export type StatusLine =
  | { kind: 'next'; title: string | null; date: string }
  | { kind: 'count'; ending: number; online: number }
  | { kind: 'missing'; count: number; field: string }
  | { kind: 'age'; title: string | null; date: string; weeks: number }
  | { kind: 'hours'; today: HoursToday }
  | { kind: 'drafts'; drafts: number; scheduled: number }

/** An entry as the status reads it: its data, and for a draft its state and when it goes live. */
export interface StatusEntry {
  data: Record<string, Json>
  state?: 'draft' | 'live'
  publishAt?: number
}

/** "Within 7 days": today and the six days after it. */
const WINDOW = 7

/**
 * The status line of `brick` and whether its section is due (`due`), from the brick's entries (removed ones left out;
 * drafts count only for the drafts line). `hours` is today's answer of the hours rules for `{ hours: true }`; without
 * it (null) the brick shows no hours line. Due: entries end within 7 days, entries miss the `missing` field, the next
 * entry starts within 7 days with a required text empty in a site language, or today's hours are unknown. The weekly
 * upkeep rule (`staleOf`) is the caller's: it needs the other bricks.
 */
export function brickStatus(
  brick: Brick,
  entries: readonly StatusEntry[],
  site: { today: string; locales: readonly Locale[]; hours?: HoursToday | null },
): { line: StatusLine | null; due: boolean } {
  const { today, locales } = site
  const main = locales[0]!
  const status = brick.status
  const live = entries.filter((e) => e.state !== 'draft')
  const title = (data: Record<string, Json>) => entryTitle(brick, data, main) ?? null
  const soon = addDays(today, WINDOW)
  if (!status) {
    if (brick.kind !== 'collection' || !brick.drafts) return { line: null, due: false }
    const drafts = entries.filter((e) => e.state === 'draft')
    const scheduled = drafts.filter((e) => e.publishAt !== undefined).length
    return drafts.length ? { line: { kind: 'drafts', drafts: drafts.length - scheduled, scheduled }, due: false } : { line: null, due: false }
  }
  if ('hours' in status) {
    const hours = site.hours ?? null
    return hours ? { line: { kind: 'hours', today: hours }, due: 'unknown' in hours } : { line: null, due: false }
  }
  if ('count' in status) {
    const online = live.filter((e) => isVisible(brick, e.data, today))
    const ending = online.filter((e) => {
      const until = visibleUntil(brick, e.data)
      return until !== undefined && until < soon
    }).length
    return { line: { kind: 'count', ending, online: online.length }, due: ending > 0 }
  }
  if ('missing' in status) {
    const field = brick.fields[status.missing]!
    const count = live.filter((e) => isEmpty(field, e.data[status.missing], main)).length
    return { line: { kind: 'missing', count, field: status.missing }, due: count > 0 }
  }
  if ('next' in status) {
    const dated = live.flatMap((e) => {
      const span = spanOf(e.data[status.next])
      return span && span.to >= today ? [{ e, ...span }] : []
    }).sort((a, b) => a.from.localeCompare(b.from))
    const next = dated[0]
    if (!next) return { line: null, due: false }
    const due = next.from < soon && Object.entries(brick.fields).some(([name, field]) => !field.optional && !field.retired && field.type !== 'slug' && name !== status.next && emptyInSomeLanguage(field, next.e.data[name], locales))
    return { line: { kind: 'next', title: title(next.e.data), date: next.from }, due }
  }
  const dated = live.flatMap((e) => {
    const span = spanOf(e.data[status.age])
    return span ? [{ e, date: span.from }] : []
  }).sort((a, b) => b.date.localeCompare(a.date))
  const newest = dated[0]
  if (!newest) return { line: null, due: false }
  return { line: { kind: 'age', title: title(newest.e.data), date: newest.date, weeks: Math.max(0, Math.floor(daysBetween(newest.date, today) / 7)) }, due: false }
}

/** A `date` as a one-day span, a `daterange` as its days; undefined when empty. */
function spanOf(value: Json | undefined): { from: string; to: string } | undefined {
  if (typeof value === 'string' && value) return { from: value, to: value }
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const { from, to } = value as { from?: unknown; to?: unknown }
    if (typeof from === 'string' && from) return { from, to: typeof to === 'string' && to ? to : from }
  }
  return undefined
}

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000)
}

/** No value: nothing stored, an empty text in `locale` for a translatable field, or an empty list. */
function isEmpty(field: Field, value: Json | undefined, locale: Locale): boolean {
  if (value === undefined || value === null || value === '') return true
  if (Array.isArray(value)) return value.length === 0
  if (isTranslatable(field) && typeof value === 'object') return textIn(value, locale).trim() === ''
  return false
}

const emptyInSomeLanguage = (field: Field, value: Json | undefined, locales: readonly Locale[]) =>
  isTranslatable(field) ? locales.some((locale) => isEmpty(field, value, locale)) : isEmpty(field, value, locales[0]!)
