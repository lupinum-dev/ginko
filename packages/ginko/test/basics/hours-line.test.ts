// Today's hours line for the Studio (SPEC templates 7.1). Wrong behaviour caught: the owner reads "open" on a day the
// website says "closed" (a closure, a holiday), the line uses the server's date instead of the site's, or it guesses
// when it cannot know (a holiday calendar in the site's code, no stored calendar on a holiday, broken data), and a holiday
// is told apart from the owner's own closure text.
import { describe, expect, it } from 'vitest'
import { hoursLine, type HoursLineContext } from '../../src/basics/index.ts'

const week = (['mo', 'tu', 'we', 'th', 'fr', 'sa', 'su'] as const).map((day) => (day === 'mo'
  ? { _id: `wk${day}`, day, closed: true }
  : { _id: `wk${day}`, day, closed: false, from1: '11:30', to1: '14:00', from2: '17:30', to2: '22:00' }))
const winter = { from: '2026-11-01', week: week.map((d) => (d.closed ? d : { ...d, from1: '17:00', to1: '21:30', from2: undefined, to2: undefined })) }
const hours = (over: Record<string, unknown> = {}) => ({ week, exceptions: [], holidays: 'closed', ...over })
const at = (iso: string, over: Partial<HoursLineContext> = {}): HoursLineContext => ({ timeZone: 'Europe/Vienna', now: new Date(iso), ...over })
const both = [['11:30', '14:00'], ['17:30', '22:00']]

describe('hoursLine', () => {
  it.each([
    ['Tuesday morning', hours(), at('2026-10-13T08:00:00Z'), { state: 'open', ranges: both }],
    // 22:30 UTC on Monday is 00:30 on Tuesday in Vienna: the site's day counts.
    ['just after midnight in Vienna', hours(), at('2026-10-12T22:30:00Z'), { state: 'open', ranges: both }],
    ['Monday, the rest day', hours(), at('2026-10-12T21:30:00Z'), { state: 'closed' }],
    ['closed today with a note', hours({ closedOn: '2026-10-13', closedNote: { de: 'Wasserrohrbruch', en: 'Burst pipe' } }), at('2026-10-13T08:00:00Z'), { state: 'closed', reason: { de: 'Wasserrohrbruch', en: 'Burst pipe' } }],
    ['a closing exception', hours({ exceptions: [{ _id: 'x1', when: { from: '2026-10-13', to: '2026-10-20' }, reason: 'Urlaub', closed: true }] }), at('2026-10-14T08:00:00Z'), { state: 'closed', reason: 'Urlaub' }],
    ['special hours', hours({ exceptions: [{ _id: 'x1', when: { from: '2026-10-13', to: '2026-10-13' }, reason: 'Feier', closed: false, from1: '11:00', to1: '15:00' }] }), at('2026-10-13T08:00:00Z'), { state: 'open', ranges: [['11:00', '15:00']] }],
    // 1 Nov 2026 (a Sunday) is All Saints' Day in Austria.
    ['a public holiday, closed', hours(), at('2026-11-01T08:00:00Z', { holidays: 'AT' }), { state: 'closed', holiday: { de: 'Allerheiligen', en: 'All Saints’ Day' } }],
    ['the same day with no public holidays', hours(), at('2026-11-01T08:00:00Z', { holidays: 'none' }), { state: 'open', ranges: both }],
    // No stored calendar: a gastro site released before `country` still closes on Austrian holidays, a basics site does not.
    ['the same day, no calendar stored', hours(), at('2026-11-01T08:00:00Z'), { state: 'unknown' }],
    ['the same day, no calendar stored, open on holidays', hours({ holidays: 'normal' }), at('2026-11-01T08:00:00Z'), { state: 'open', ranges: both }],
    ['a closure on that day, no calendar stored', hours({ closedOn: '2026-11-01', closedNote: 'Feiertag' }), at('2026-11-01T08:00:00Z'), { state: 'closed', reason: 'Feiertag' }],
    ['a calendar in code could decide', hours(), at('2026-11-01T08:00:00Z', { holidays: 'custom' }), { state: 'unknown' }],
    ['a closure decides before any calendar', hours({ closedOn: '2026-11-01' }), at('2026-11-01T08:00:00Z', { holidays: 'custom' }), { state: 'closed' }],
    ['a plan from today', hours(), at('2026-11-03T08:00:00Z', { plans: [winter] }), { state: 'open', ranges: [['17:00', '21:30']] }],
    ['open without times', hours({ week: week.map((d) => ({ _id: d._id, day: d.day, closed: false })) }), at('2026-10-13T08:00:00Z'), { state: 'unknown' }],
    ['no row for today', hours({ week: week.filter((d) => d.day !== 'tu') }), at('2026-10-13T08:00:00Z'), { state: 'unknown' }],
    ['not hours at all', null, at('2026-10-13T08:00:00Z'), { state: 'unknown' }],
    ['a week that is no list', { week: 'mo-fr' }, at('2026-10-13T08:00:00Z'), { state: 'unknown' }],
  ])('%s', (_, data, ctx, line) => {
    expect(hoursLine(data, ctx)).toEqual(line)
  })
})
