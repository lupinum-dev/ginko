// schema.org opening hours for search engines. They come from the same rule as the page (`hoursOn`), so Google never
// shows "open" on a day the site says "closed". For any LocalBusiness type (Restaurant, Physician, Store ...).
import { addDays, hoursOn, spansOf, weekdayKeys, weekdayOf, weekFor, type HoursContext, type Span, type Weekday } from './hours.ts'

const dayNames: Record<Weekday, string> = { mo: 'Monday', tu: 'Tuesday', we: 'Wednesday', th: 'Thursday', fr: 'Friday', sa: 'Saturday', su: 'Sunday' }

const spanKey = (spans: Span[]) => spans.map((s) => `${s.from}-${s.to}`).join(',')

/** The weekly rule: days with the same times share one entry (one entry per time window). */
function weeklySpecs(week: ReturnType<typeof weekFor>['week']) {
  const groups = new Map<string, { spans: Span[]; days: Weekday[] }>()
  for (const key of weekdayKeys) {
    const day = week.find((d) => d.day === key)
    const spans = !day || day.closed ? [] : spansOf(day)
    if (!spans.length) continue
    const k = spanKey(spans)
    const group = groups.get(k) ?? { spans, days: [] }
    group.days.push(key)
    groups.set(k, group)
  }
  return [...groups.values()].flatMap((g) => g.spans.map((s) => ({ '@type': 'OpeningHoursSpecification', dayOfWeek: g.days.map((d) => dayNames[d]), opens: s.from, closes: s.to })))
}

/**
 * Days within `days` days that differ from the weekday rule of the week that applies today: a closure
 * (opens and closes "00:00", the way Google reads "closed all day") or other times. Consecutive days
 * with the same result become one entry with `validFrom` and `validThrough`.
 */
function specialSpecs(ctx: HoursContext, today: string, days: number, week: ReturnType<typeof weekFor>['week']) {
  const runs: Array<{ key: string; spans: Span[]; from: string; to: string }> = []
  for (let i = 0; i < days; i++) {
    const date = addDays(today, i)
    const rule = hoursOn(ctx, date)
    const base = week.find((d) => d.day === weekdayOf(date))
    const baseKey = !base || base.closed ? '' : spanKey(spansOf(base))
    const key = rule.closed ? '' : spanKey(rule.times)
    if (key === baseKey) continue
    const last = runs[runs.length - 1]
    if (last && last.key === key && last.to === addDays(date, -1)) last.to = date
    else runs.push({ key, spans: rule.closed ? [] : rule.times, from: date, to: date })
  }
  return runs.flatMap((r) => (r.spans.length ? r.spans : [{ from: '00:00', to: '00:00' }]).map((s) => ({
    '@type': 'OpeningHoursSpecification', validFrom: r.from, validThrough: r.to, opens: s.from, closes: s.to,
  })))
}

/**
 * `openingHoursSpecification` (the week that applies `today`) and, when a day within `days` days (default 60) differs
 * from it, `specialOpeningHoursSpecification`: spread both into a LocalBusiness node.
 */
export function openingHoursJsonLd(ctx: HoursContext, today: string, days = 60): Record<string, unknown> {
  const { week } = weekFor(ctx, today)
  const special = specialSpecs(ctx, today, days, week)
  return { openingHoursSpecification: weeklySpecs(week), ...(special.length ? { specialOpeningHoursSpecification: special } : {}) }
}
