// The status lines of the Today page (UI.md 3, `status` on a brick): computed here with core `brickStatus` and the
// weekly upkeep rule `staleOf`, shown by the Studio (sites.today) and mailed when due (reminders.ts) in the same words.
import type { Brick, Json } from '@lupinum/ginko'
import { brickStatus, hoursLine, labelOf, plannedWeeks, staleOf, type HourPlan, type HoursToday, type Schema, type StatusLine } from '@lupinum/ginko/internal'
import type { Doc } from '../_generated/dataModel'
import type { QueryCtx } from '../_generated/server'
import { t } from './i18n'

/**
 * The opening hours of a single with `status: { hours: true }` (basics `hours()`) on `today` (`YYYY-MM-DD`, the site's
 * day), by the basics rules with the site's stored `holidays` and its hour plans. A public holiday's name stands where
 * an owner's reason would. `null` (no line, not due) when the hours are entered and only a holiday calendar the server
 * cannot run could decide the day; `unknown` (due) is for hours missing for that day.
 */
export function hoursToday(data: Record<string, Json>, today: string, schema: Schema, plans: readonly HourPlan[]): HoursToday | null {
  // hoursLine reads "today" from a clock in a zone; noon UTC of the given day is that day in UTC.
  const line = hoursLine(data, { timeZone: 'UTC', now: new Date(`${today}T12:00:00Z`), plans: [...plans], ...(schema.holidays !== undefined ? { holidays: schema.holidays } : {}) })
  if (line.state === 'open') return { ranges: line.ranges }
  if (line.state === 'unknown') return line.calendar ? null : { unknown: true }
  const reason = line.reason ?? (line.holiday && { de: line.holiday.de, en: line.holiday.en })
  return reason ? { closed: true, reason } : { closed: true }
}

/**
 * The hour plans of `hourPlans()` ("other hours from a date"): live entries of the collections shaped like it (a `week`
 * list, a `from` date and a `yearly` switch). The schema has no link from hours to its plans, so the shape decides.
 */
function isHourPlans(brick: Brick): boolean {
  const f = brick.fields
  return brick.kind === 'collection' && !brick.retired && f.week?.type === 'list' && f.from?.type === 'date' && f.yearly?.type === 'boolean'
}

export interface BrickState {
  brick: string
  line: StatusLine | null
  /** The section needs doing: its status is due, or its week is not entered (`staleOf`). */
  due: boolean
}

/**
 * The state of each brick in `keys` on `today` (retired and unknown ones left out). `own`: a staff member's user id;
 * their drafts line counts only the drafts they created.
 */
export async function statesOf(ctx: Pick<QueryCtx, 'db'>, site: Doc<'sites'>, keys: readonly string[], today: string, own?: string): Promise<BrickState[]> {
  const schema = site.schema as Schema
  const cache = new Map<string, Doc<'entries'>[]>()
  const rowsOf = async (key: string) => {
    let rows = cache.get(key)
    if (!rows) {
      rows = await ctx.db.query('entries').withIndex('by_site_brick_deleted', (q) => q.eq('site', site._id).eq('brick', key).eq('deletedAt', undefined)).collect()
      cache.set(key, rows)
    }
    return rows
  }
  const out: BrickState[] = []
  for (const key of keys) {
    const brick = Object.hasOwn(schema.bricks, key) ? schema.bricks[key]! : undefined
    if (!brick || brick.retired) continue
    const rows = (await rowsOf(key)).filter((row) => own === undefined || row.state !== 'draft' || row.createdBy === own)
    const single = brick.kind === 'single' ? rows[0] : undefined
    let hours: HoursToday | null = null
    if (brick.status && 'hours' in brick.status && single) {
      const plans: HourPlan[] = []
      for (const [k, b] of Object.entries(schema.bricks)) {
        if (isHourPlans(b)) for (const row of await rowsOf(k)) if (row.state !== 'draft') plans.push({ _id: row._id, ...(row.data as unknown as Omit<HourPlan, '_id'>) })
      }
      hours = hoursToday(single.data as Record<string, Json>, today, schema, plans)
    }
    const status = brickStatus(brick, rows.map((row) => ({ data: row.data as Record<string, Json>, ...(row.state ? { state: row.state } : {}), ...(row.publishAt !== undefined ? { publishAt: row.publishAt } : {}) })), { today, locales: schema.locales, hours })
    let stale = false
    if (single) {
      // Weeks planned ahead count as entered (the rule of the Studio and the reminder): live entries of the planning collections.
      const planning = Object.entries(schema.bricks).filter(([, b]) => b.kind === 'collection' && !b.retired && b.plans?.brick === key).map(([k]) => k)
      const live = new Map<string, { data: Record<string, Json> }[]>()
      for (const k of planning) live.set(k, (await rowsOf(k)).filter((row) => row.state !== 'draft').map((row) => ({ data: row.data as Record<string, Json> })))
      const week = staleOf(brick, single.data as Record<string, Json>, today, schema.week, plannedWeeks(schema, key, (k) => live.get(k) ?? []))
      stale = week?.current === false
    }
    out.push({ brick: key, line: status.line, due: status.due || stale })
  }
  return out
}

/** A `YYYY-MM-DD` day as the Studio shows it (`formatDay`): day, month and year in the reader's language. */
const dayIn = (date: string, locale: string) => new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${date}T00:00:00Z`))

/** The words of a status line in `locale`, as the Studio's Today page writes them (for the reminder mail). */
export function statusText(locale: string, schema: Schema, brick: Brick, line: StatusLine): string {
  const main = schema.locales[0]!
  const title = (value: string | null) => value ?? labelOf(brick.label, locale, main)
  switch (line.kind) {
    case 'next': return t(locale, 'status.next', { title: title(line.title), date: dayIn(line.date, locale) })
    case 'count': return line.ending > 0 ? t(locale, 'status.ending', { count: line.ending }) : t(locale, 'status.online', { count: line.online })
    case 'missing': return t(locale, 'status.missing', { count: line.count, field: labelOf(brick.fields[line.field]?.label ?? line.field, locale, main) })
    case 'age': return line.weeks > 0 ? t(locale, 'status.age', { title: title(line.title), weeks: line.weeks }) : t(locale, 'status.ageThisWeek', { title: title(line.title) })
    case 'drafts': return t(locale, 'status.drafts', { drafts: line.drafts, scheduled: line.scheduled })
    case 'hours': {
      const today = line.today
      if ('ranges' in today) return t(locale, 'status.open', { ranges: new Intl.ListFormat(locale, { style: 'short', type: 'unit' }).format(today.ranges.map(([from, to]) => `${from}–${to}`)) })
      if ('unknown' in today) return t(locale, 'status.hoursUnknown')
      return today.reason ? t(locale, 'status.closedBecause', { reason: labelOf(today.reason, locale, main) }) : t(locale, 'status.closed')
    }
  }
}
