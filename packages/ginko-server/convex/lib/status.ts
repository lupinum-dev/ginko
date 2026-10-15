// The status lines of the Today page (UI.md 3, `status` on a brick): computed here with core `brickStatus` and the
// weekly upkeep rule `staleOf`, shown by the Studio (sites.today) and mailed when due (reminders.ts) in the same words.
import type { Brick, Json } from '@lupinum/ginko'
import { brickStatus, labelOf, plannedWeeks, staleOf, type HoursToday, type Schema, type StatusLine } from '@lupinum/ginko/internal'
import type { Doc } from '../_generated/dataModel'
import type { QueryCtx } from '../_generated/server'
import { t } from './i18n'

/**
 * Today's opening hours of a single with `status: { hours: true }`. Core has no hours rules yet (they live in the gastro
 * preset); until core exports `hoursLine`, no hours line shows and the section is never due for it.
 */
export function hoursToday(_brick: Brick, _data: Record<string, Json>, _today: string, _schema: Schema): HoursToday | null {
  return null
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
    const hours = brick.status && 'hours' in brick.status && single ? hoursToday(brick, single.data as Record<string, Json>, today, schema) : null
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

/**
 * The words of a status line in `locale`, as the Studio's Today page writes them (for the reminder mail). Null for hours
 * that are unknown today: the section is due, but there is no line to show.
 */
export function statusText(locale: string, schema: Schema, brick: Brick, line: StatusLine): string | null {
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
      return 'closed' in today ? t(locale, 'status.closed') : null
    }
  }
}
