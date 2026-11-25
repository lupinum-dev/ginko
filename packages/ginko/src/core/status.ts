// The status line of a brick on the Studio's Today page (`status` on a brick, UI.md 3) and whether its section is due.
// The platform computes it from the live entries; the Studio shows it and the weekly reminder mails the due ones.
import { isTranslatable } from './fields.ts'
import { entryTitle, textIn } from './list.ts'
import { shownOn, shownUntil } from './resolve.ts'
import { addDays } from './time.ts'
import type { Brick, Field, FieldType, Json, Locale, Schema } from './types.ts'

/** A field a status rule reads: its type, and for a rows field its row set (`'weekdays'`). */
export interface RuleField { type: FieldType; rows?: string }

/**
 * A status rule: a named line for a single on the Today page (`status: { rule: '<name>' }`). A pattern brings it; the
 * core knows it only by name, from the rules its caller passes (`statusRules` of `@lupinum/ginko/patterns`). The rule
 * states the fields it reads, so the core guesses nothing: `checkSchema` refuses a brick without them.
 */
export interface StatusRule<T = unknown> {
  /** The fields the brick must have, by name. */
  inputs: Readonly<Record<string, RuleField>>
  /** The fields a collection named in `status.plans` must have. Without it, the rule takes no plans. */
  plans?: Readonly<Record<string, RuleField>>
  /**
   * The line on `today` (`YYYY-MM-DD`, the site's day) from the single's data and the live entries of its plans, and
   * whether the section is due. Null: no line.
   */
  today(data: Record<string, Json>, ctx: { today: string; plans: readonly Record<string, Json>[]; schema: Schema }): { line: T; due: boolean } | null
}

/** The rules a caller knows, by name. */
export type StatusRules = Readonly<Record<string, StatusRule>>

/** The line of a rule: its name and what its `today` answers (`{ kind: 'rule', rule: 'x', today: … }`). */
export type RuleLine<R extends StatusRules> = { [K in keyof R & string]: { kind: 'rule'; rule: K; today: R[K] extends StatusRule<infer T> ? T : never } }[keyof R & string]

/**
 * What the status line says. Titles are in the site's main language (null while an entry has none: the Studio shows the
 * brick's label), dates are `YYYY-MM-DD`, `field` is the field's name. `R`: the known rules, for the lines of rules.
 */
export type StatusLine<R extends StatusRules = StatusRules> =
  | { kind: 'next'; title: string | null; date: string }
  | { kind: 'count'; ending: number; online: number }
  | { kind: 'missing'; count: number; field: string }
  | { kind: 'age'; title: string | null; date: string; weeks: number }
  | RuleLine<R>
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
 * drafts count only for the drafts line). A single with `status: { rule }` asks the rule of that name in `rules`, with
 * `site.plans`: the live entries of the collection its status names. Due: entries end within 7 days, entries miss the
 * `missing` field, the next entry starts within 7 days with a required text empty in a site language, or the rule says
 * so. The weekly upkeep rule (`staleOf`) is the caller's: it needs the other bricks.
 */
export function brickStatus<R extends StatusRules>(
  brick: Brick,
  entries: readonly StatusEntry[],
  site: { today: string; locales: readonly Locale[]; schema: Schema; plans?: readonly Record<string, Json>[] },
  rules: R,
): { line: StatusLine<R> | null; due: boolean } {
  const { today, locales } = site
  const main = locales[0]!
  const status = brick.status
  const live = entries.filter((e) => e.state !== 'draft')
  const title = (data: Record<string, Json>) => entryTitle(brick, data, main) ?? null
  const soon = addDays(today, WINDOW)
  if (!status) {
    if (brick.kind !== 'collection') return { line: null, due: false }
    const drafts = entries.filter((e) => e.state === 'draft')
    const scheduled = drafts.filter((e) => e.publishAt !== undefined).length
    return drafts.length ? { line: { kind: 'drafts', drafts: drafts.length - scheduled, scheduled }, due: false } : { line: null, due: false }
  }
  if ('rule' in status) {
    const rule = Object.hasOwn(rules, status.rule) ? rules[status.rule] : undefined
    const data = entries[0]?.data
    const answer = rule && data ? rule.today(data, { today, plans: site.plans ?? [], schema: site.schema }) : null
    // `rule` is a key of `rules`, and `today` is what that rule answers: the line of exactly that rule.
    return answer ? { line: { kind: 'rule', rule: status.rule, today: answer.line } as RuleLine<R>, due: answer.due } : { line: null, due: false }
  }
  if ('count' in status) {
    const online = live.filter((e) => shownOn(brick, e.data, today))
    const ending = online.filter((e) => {
      const until = shownUntil(brick, e.data)
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
