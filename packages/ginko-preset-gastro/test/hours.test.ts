// The "Heute" board and the hours table decide open or closed from one rule (`hoursOn`); a wrong order tells guests the house is open on a holiday.
import { describe, expect, it } from 'vitest'
import { austrianHolidays, holidayOn, hoursOn, todayState, upcomingClosures, upcomingPlans, weekOf, type DayHours, type Exception, type HourPlan } from '../src/hours.ts'

const week: DayHours[] = [
  { day: 'mo', closed: true },
  { day: 'th', closed: false, from1: '11:30', to1: '14:00', from2: '17:30', to2: '22:00' },
]
const holiday: Exception = { _id: 'x1', when: { from: '2026-10-26', to: '2026-10-26' }, reason: 'Nationalfeiertag', closed: true }
const winter: Exception = { _id: 'x2', when: { from: '2026-12-22', to: '2027-01-06' }, reason: 'Betriebsurlaub', closed: true }

describe('todayState', () => {
  it.each([
    ['a normal Thursday is open with both times', { week, exceptions: [] }, '2026-10-08', { kind: 'open', times: [{ from: '11:30', to: '14:00' }, { from: '17:30', to: '22:00' }] }],
    ['Monday is the weekly rest day', { week, exceptions: [] }, '2026-10-05', { kind: 'restDay' }],
    ['the owner closed today, with her note', { week, exceptions: [], closedOn: '2026-10-08', closedNote: 'Hochzeit' }, '2026-10-08', { kind: 'closed', reason: 'Hochzeit', field: 'closedNote' }],
    ['yesterday’s closing switch no longer counts', { week, exceptions: [], closedOn: '2026-10-07' }, '2026-10-08', { kind: 'open', times: [{ from: '11:30', to: '14:00' }, { from: '17:30', to: '22:00' }] }],
    ['a closure spanning New Year covers a Thursday inside it', { week, exceptions: [winter] }, '2026-12-31', { kind: 'closed', reason: 'Betriebsurlaub', field: 'exceptions.x2.reason' }],
  ] as const)('%s', (_name, hours, today, expected) => {
    expect(todayState({ hours: hours as never }, today)).toEqual(expected)
  })
})

describe('upcomingClosures', () => {
  it('shows a closure only within the notice days and before it starts', () => {
    const ctx = (exceptions: Exception[]) => ({ hours: { week, exceptions }, calendar: 'none' as const })
    expect(upcomingClosures(ctx([winter, holiday]), '2026-10-12', 14).map((e) => e._id)).toEqual(['x1'])
    expect(upcomingClosures(ctx([holiday]), '2026-10-26', 14)).toEqual([])
    expect(upcomingClosures(ctx([holiday]), '2026-10-01', 14)).toEqual([])
  })
})

const full = (day: string, t: object = {}): DayHours => ({ day, closed: false, from1: '11:30', to1: '14:00', from2: '17:30', to2: '22:00', ...t })
const weekWith = (overrides: Record<string, DayHours> = {}): DayHours[] =>
  ['mo', 'tu', 'we', 'th', 'fr', 'sa', 'su'].map((d) => overrides[d] ?? (d === 'mo' ? { day: d, closed: true } : full(d)))
const sunday = { day: 'su', closed: false, from1: '11:30', to1: '15:00' }
const standard = weekWith({ su: sunday })
const baseHours = { week: standard, exceptions: [] as Exception[] }

const winterPlan: HourPlan = { _id: 'p1', label: 'Winter', from: '2026-11-01', to: '2027-03-31', yearly: true, week: weekWith({ su: { day: 'su', closed: true }, th: { day: 'th', closed: false, from1: '12:00', to1: '15:00' } }) }
const fromNovember: HourPlan = { _id: 'p2', label: 'Neu ab Nov', from: '2026-11-02', week: weekWith({ th: { day: 'th', closed: false, from1: '10:00', to1: '12:00' } }) }
const summer: HourPlan = { _id: 'p3', from: '2026-06-01', to: '2026-08-31', yearly: true, week: standard }
const early: Exception = { _id: 'e1', when: { from: '2026-12-24', to: '2026-12-24' }, reason: 'Heiligabend', closed: false, from1: '11:00', to1: '14:00' }

const normalTimes = [{ from: '11:30', to: '14:00' }, { from: '17:30', to: '22:00' }]
const winterThursday = [{ from: '12:00', to: '15:00' }]

describe('hoursOn precedence', () => {
  it.each([
    ['standard week', '2026-10-08', {}, [], { closed: false, times: normalTimes, source: 'week' }],
    ['standard rest day', '2026-10-05', {}, [], { closed: true, source: 'week' }],
    ['plan beats week', '2026-11-05', {}, [winterPlan], { closed: false, times: winterThursday, source: 'plan' }],
    ['plan ended: week again', '2027-04-01', {}, [winterPlan], { closed: false, times: normalTimes, source: 'week' }],
    ['yearly winter plan wraps New Year (January)', '2027-01-14', {}, [winterPlan], { closed: false, times: winterThursday, source: 'plan' }],
    ['yearly winter plan wraps New Year (December)', '2026-12-17', {}, [winterPlan], { closed: false, times: winterThursday, source: 'plan' }],
    ['yearly plan repeats in later years', '2028-02-10', {}, [winterPlan], { closed: false, times: winterThursday, source: 'plan' }],
    ['yearly plan does not apply before its first start', '2026-01-15', {}, [winterPlan], { closed: false, times: normalTimes, source: 'week' }],
    ['yearly plan is off in summer', '2027-07-08', {}, [winterPlan], { closed: false, times: normalTimes, source: 'week' }],
    ['two plans overlap: later from wins', '2026-11-05', {}, [winterPlan, fromNovember], { closed: false, times: [{ from: '10:00', to: '12:00' }], source: 'plan' }],
    ['the order of the plans does not matter', '2026-11-05', {}, [fromNovember, winterPlan], { closed: false, times: [{ from: '10:00', to: '12:00' }], source: 'plan' }],
    ['open-ended plan runs on', '2031-03-06', {}, [fromNovember], { closed: false, times: [{ from: '10:00', to: '12:00' }], source: 'plan' }],
    ['open-ended plan has not started', '2026-10-29', {}, [fromNovember], { closed: false, times: normalTimes, source: 'week' }],
    ['holiday uses Sunday of the standard week', '2026-10-26', {}, [], { closed: false, times: [{ from: '11:30', to: '15:00' }], source: 'holiday', holiday: { de: 'Nationalfeiertag', en: 'Austrian National Day' } }],
    ['holiday uses the Sunday of the applicable plan (closed)', '2026-12-08', {}, [winterPlan], { closed: true, source: 'holiday', holiday: { en: 'Immaculate Conception' } }],
    ['holiday setting closed', '2026-10-26', { holidays: 'closed' }, [], { closed: true, source: 'holiday' }],
    ['holiday setting normal falls through to the Monday rule', '2026-10-26', { holidays: 'normal' }, [], { closed: true, source: 'week' }],
    ['holiday beats the plan weekday', '2027-01-06', {}, [winterPlan], { closed: true, source: 'holiday', holiday: { en: 'Epiphany' } }],
    ['exception with times beats holiday', '2026-12-25', { exceptions: [{ _id: 'e2', when: { from: '2026-12-25', to: '2026-12-25' }, reason: 'Weihnachten', closed: false, from1: '12:00', to1: '15:00' }] }, [], { closed: false, times: winterThursday, source: 'exception', reason: 'Weihnachten' }],
    ['closing exception beats holiday and plan', '2027-01-06', { exceptions: [{ _id: 'e3', when: { from: '2026-12-22', to: '2027-01-10' }, reason: 'Urlaub', closed: true }] }, [winterPlan], { closed: true, source: 'exception', reason: 'Urlaub' }],
    ['special hours: closes early on 24.12.', '2026-12-24', { exceptions: [early] }, [winterPlan], { closed: false, times: [{ from: '11:00', to: '14:00' }], source: 'exception', reason: 'Heiligabend' }],
    ['a non-closed exception without times does nothing', '2026-10-08', { exceptions: [{ _id: 'e4', when: { from: '2026-10-08', to: '2026-10-08' }, reason: 'x', closed: false }] }, [], { closed: false, times: normalTimes, source: 'week' }],
    ['closedOn beats exception, holiday and plan', '2026-10-26', { closedOn: '2026-10-26', closedNote: 'Hochzeit', exceptions: [{ _id: 'e5', when: { from: '2026-10-26', to: '2026-10-26' }, reason: 'x', closed: false, from1: '09:00', to1: '10:00' }] }, [winterPlan], { closed: true, source: 'today', reason: 'Hochzeit' }],
  ] as const)('%s', (_name, date, extra, plans, expected) => {
    const rule = hoursOn({ hours: { ...baseHours, ...(extra as object) } as never, plans: plans as never }, date)
    expect(rule).toMatchObject(expected as object)
  })

  it('a holiday rule carries no German reason, only the names in both languages', () => {
    expect(hoursOn({ hours: baseHours }, '2026-10-26')).not.toHaveProperty('reason')
  })

  it('weekOf returns seven days from Monday with the winter plan applied', () => {
    const days = weekOf({ hours: baseHours, plans: [winterPlan] }, '2026-11-02')
    expect(days.map((d) => d.date)).toEqual(['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07', '2026-11-08'])
    expect(days[3]).toMatchObject({ weekday: 'th', source: 'plan', times: winterThursday })
    expect(days[6]).toMatchObject({ weekday: 'su', closed: true })
  })
})

describe('austrianHolidays', () => {
  it.each([
    [2026, ['2026-01-01', '2026-01-06', '2026-04-06', '2026-05-01', '2026-05-14', '2026-05-25', '2026-06-04', '2026-08-15', '2026-10-26', '2026-11-01', '2026-12-08', '2026-12-25', '2026-12-26']],
    [2027, ['2027-01-01', '2027-01-06', '2027-03-29', '2027-05-01', '2027-05-06', '2027-05-17', '2027-05-27', '2027-08-15', '2027-10-26', '2027-11-01', '2027-12-08', '2027-12-25', '2027-12-26']],
  ])('%i', (year, dates) => {
    expect(austrianHolidays(year).map((h) => h.date)).toEqual(dates)
  })
  it('has German and English names', () => {
    expect(holidayOn('2026-04-06')).toEqual({ date: '2026-04-06', de: 'Ostermontag', en: 'Easter Monday' })
  })
})

describe('todayState with special hours, plans and holidays', () => {
  it('shows the special times of a non-closed exception', () => {
    expect(todayState({ hours: { ...baseHours, exceptions: [early] } }, '2026-12-24')).toEqual({ kind: 'open', times: [{ from: '11:00', to: '14:00' }], reason: 'Heiligabend', field: 'exceptions.e1.reason' })
  })
  it('a closed holiday reports its names', () => {
    expect(todayState({ hours: { ...baseHours, holidays: 'closed' } }, '2026-10-26')).toEqual({ kind: 'holiday', holiday: { de: 'Nationalfeiertag', en: 'Austrian National Day' } })
  })
  it('uses plans when given', () => {
    expect(todayState({ hours: baseHours, plans: [winterPlan] }, '2026-11-05')).toEqual({ kind: 'open', times: [{ from: '12:00', to: '15:00' }] })
  })
})

describe('upcomingClosures with holidays', () => {
  it('adds holidays on which the house is closed', () => {
    const ctx = { hours: { ...baseHours, holidays: 'closed' as const } }
    expect(upcomingClosures({ ...ctx, hours: { ...ctx.hours, exceptions: [winter] } }, '2026-10-12', 20).map((e) => e._id)).toEqual(['holiday-2026-10-26', 'holiday-2026-11-01'])
  })
  it('does not list holidays on which the house opens like on Sunday', () => {
    expect(upcomingClosures({ hours: baseHours }, '2026-10-12', 20)).toEqual([])
  })
})

describe('upcomingPlans', () => {
  it('finds the next start of a yearly plan and ignores plans already running', () => {
    expect(upcomingPlans([winterPlan, summer], '2026-10-08', 60).map((p) => [p.plan._id, p.starts])).toEqual([['p1', '2026-11-01']])
  })
})
