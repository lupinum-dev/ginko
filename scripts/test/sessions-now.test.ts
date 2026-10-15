import { describe, expect, it } from 'vitest'
import { byDay, dayAndClock, nowAndNext } from '../../templates/_features/sessions/app/utils/sessions.ts'

const s = (date: string, from: string, to: string, title: string, status = 'open') => ({ date, from, to, title, status })
// Two days in programme order; on the first, two rooms start together at 11:00.
const programme = [
  s('2026-11-19', '09:30', '10:15', 'Welcome'),
  s('2026-11-19', '10:30', '11:00', 'Coffee'),
  s('2026-11-19', '11:00', '11:45', 'Talk A'),
  s('2026-11-19', '11:00', '12:30', 'Workshop B', 'cancelled'),
  s('2026-11-20', '09:30', '10:15', 'Day two'),
]
const titles = (list: { title: string }[]) => list.map((x) => x.title)

// "Now and next" on the home page during the event (templates/_features/sessions).
describe('nowAndNext', () => {
  // Wrong behaviour caught: a session shown as "now" after its end (the end counted as inside), the second room that
  // starts at the same time left out of "next", a cancelled session hidden although people would walk to its room,
  // or the block shown on a day without sessions.
  it.each([
    ['before the first session', '2026-11-19', '08:00', [], ['Welcome'], false],
    ['during a session', '2026-11-19', '09:45', ['Welcome'], ['Coffee'], false],
    ['at the end minute of a session', '2026-11-19', '10:15', [], ['Coffee'], false],
    ['two rooms starting together come next together', '2026-11-19', '10:45', ['Coffee'], ['Talk A', 'Workshop B'], false],
    ['a cancelled session still shows (with its word)', '2026-11-19', '11:50', ['Workshop B'], [], false],
    ['after the last session of the day', '2026-11-19', '13:00', [], [], true],
  ])('%s', (_, date, clock, now, next, over) => {
    const result = nowAndNext(programme, date, clock)
    expect({ day: result.day, now: titles(result.now), next: titles(result.next), over: result.over }).toEqual({ day: true, now, next, over })
  })

  it('is no event day when the date has no session', () => {
    expect(nowAndNext(programme, '2026-11-21', '10:00')).toEqual({ day: false, now: [], next: [], over: false })
  })
})

describe('dayAndClock', () => {
  // Wrong behaviour caught: the clock read in UTC (or the server's zone), so at 09:40 UTC a Vienna page said 09:40
  // instead of 10:40, or the day changed at midnight UTC instead of local midnight.
  it.each([
    ['winter time in Vienna', '2026-11-19T09:40:00Z', { date: '2026-11-19', clock: '10:40' }],
    ['after local midnight, still the day before in UTC', '2026-11-19T23:30:00Z', { date: '2026-11-20', clock: '00:30' }],
    ['summer time in Vienna', '2026-07-01T08:00:00Z', { date: '2026-07-01', clock: '10:00' }],
  ])('%s', (_, instant, expected) => {
    expect(dayAndClock('Europe/Vienna', Date.parse(instant))).toEqual(expected)
  })
})

describe('byDay', () => {
  // Wrong behaviour caught: a day split in two, or a session under the wrong day heading of the programme.
  it('groups sessions in programme order by their date', () => {
    expect(byDay(programme).map((day) => [day.date, titles(day.sessions)])).toEqual([
      ['2026-11-19', ['Welcome', 'Coffee', 'Talk A', 'Workshop B']],
      ['2026-11-20', ['Day two']],
    ])
  })
})
