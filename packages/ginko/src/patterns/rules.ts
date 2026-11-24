// The status rules of the patterns: the lines a single shows on the Studio's Today page, by name
// (`status: { rule: 'opening-hours' }`). The core knows a rule only by name: every caller that checks a schema or
// computes a line (`checkSchema`, `checkSite`, `brickStatus`) passes `statusRules`, so the server knows the rules of the
// pattern packages it was built with. A site names a rule; it cannot add one.
import type { Label, StatusLine, StatusRule } from '../core/index.ts'
import { hoursLine, type HourPlan } from './hours.ts'

/**
 * Today's opening hours of a single with `status: { rule: 'opening-hours' }`: closed (with the owner's reason or the
 * public holiday's name, when there is one), open in `ranges` (`['11:30', '14:30']`), or unknown (the hours give no
 * answer for today, which makes the section due).
 */
export type HoursToday = { closed: true; reason?: Label } | { ranges: readonly (readonly [string, string])[] } | { unknown: true }

/** The days of a week, the row set of the hours' `week`. */
const WEEK = { type: 'rows', rows: 'weekdays' } as const

/**
 * The opening hours of `hours()`: today's hours on `today`, by the hours rules with the site's stored `holidays` and the
 * live entries of the hour plans its status names (`hours({ plans: 'hourPlans' })`). A public holiday's name stands
 * where an owner's reason would. No line (not due) when the hours are entered and only a holiday calendar the server
 * cannot run could decide the day; `unknown` (due) is for hours missing for that day.
 */
export const openingHours: StatusRule<HoursToday> = {
  inputs: { week: WEEK, exceptions: { type: 'list' }, closedOn: { type: 'date' }, holidays: { type: 'choice' } },
  plans: { week: WEEK, from: { type: 'date' }, yearly: { type: 'boolean' } },
  today(data, { today, plans, schema }) {
    // hoursLine reads "today" from a clock in a zone; noon UTC of the given day is that day in UTC. The plans are entries
    // of a collection that `checkSchema` checked for the fields of `plans` above: stored data of the shape of HourPlan.
    const line = hoursLine(data, { timeZone: 'UTC', now: new Date(`${today}T12:00:00Z`), plans: plans as unknown as HourPlan[], ...(schema.holidays !== undefined ? { holidays: schema.holidays } : {}) })
    if (line.state === 'open') return { line: { ranges: line.ranges }, due: false }
    if (line.state === 'unknown') return line.calendar ? null : { line: { unknown: true }, due: true }
    const reason = line.reason ?? (line.holiday && { de: line.holiday.de, en: line.holiday.en })
    return { line: reason ? { closed: true, reason } : { closed: true }, due: false }
  },
}

/** The status rules Ginko knows, by name. Pass them to `checkSchema`, `checkSite` and `brickStatus`. */
export const statusRules = { 'opening-hours': openingHours } satisfies Record<string, StatusRule>

/** The name of a status rule Ginko knows: what `status: { rule }` takes in a site file. */
export type StatusRuleName = keyof typeof statusRules

/** A line of the Today page with the lines of the known rules: what the server computes and the Studio renders. */
export type TodayLine = StatusLine<typeof statusRules>
