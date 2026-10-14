// A wrong calendar closes (or opens) a restaurant on the wrong day and tells guests so.
import { describe, expect, it } from 'vitest'
import { germanHolidays, singaporeHolidays } from '../src/holidays.ts'
import { holidayOn, hoursOn, type DayHours, type HoursData } from '../src/hours.ts'

const dates = (list: Array<{ date: string }>) => list.map((h) => h.date)

describe('germanHolidays', () => {
  it('has the 9 nationwide days of 2027, with Easter-based days moving', () => {
    expect(dates(germanHolidays(2027))).toEqual([
      '2027-01-01', '2027-03-26', '2027-03-29', '2027-05-01', '2027-05-06', '2027-05-17', '2027-10-03', '2027-12-25', '2027-12-26',
    ])
  })
  it('Easter Monday 2026 is 6 April, Good Friday 3 April', () => {
    expect(germanHolidays(2026).filter((h) => h.en === 'Easter Monday' || h.en === 'Good Friday').map((h) => [h.date, h.de])).toEqual([['2026-04-03', 'Karfreitag'], ['2026-04-06', 'Ostermontag']])
  })
  it('leaves out regional days such as Epiphany (6 Jan)', () => {
    expect(holidayOn('2026-01-06', germanHolidays)).toBeUndefined()
  })
})

describe('singaporeHolidays', () => {
  it('2026 follows the official list, with Monday replacing a Sunday holiday', () => {
    expect(dates(singaporeHolidays(2026))).toEqual([
      '2026-01-01', '2026-02-17', '2026-02-18', '2026-03-21', '2026-04-03', '2026-05-01', '2026-05-27', '2026-05-31', '2026-06-01',
      '2026-08-09', '2026-08-10', '2026-11-08', '2026-11-09', '2026-12-25',
    ])
  })
  it('2027 follows the official list, Chinese New Year on Sunday moves to Monday 8 Feb', () => {
    expect(dates(singaporeHolidays(2027))).toEqual([
      '2027-01-01', '2027-02-06', '2027-02-07', '2027-02-08', '2027-03-10', '2027-03-26', '2027-05-01', '2027-05-17', '2027-05-20',
      '2027-08-09', '2027-10-28', '2027-12-25',
    ])
  })
  it('a year outside the table has only the fixed-date holidays', () => {
    expect(dates(singaporeHolidays(2030))).toEqual(['2030-01-01', '2030-05-01', '2030-08-09', '2030-12-25'])
  })
  it('names the National Day in both languages', () => {
    expect(holidayOn('2027-08-09', 'SG')).toEqual({ date: '2027-08-09', de: 'Nationalfeiertag', en: 'National Day' })
  })
})

const open = (day: string): DayHours => ({ day, closed: false, from1: '11:30', to1: '14:00' })
const week = ['mo', 'tu', 'we', 'th', 'fr', 'sa', 'su'].map(open)
const closedOnHolidays: HoursData = { week, exceptions: [], holidays: 'closed' }

describe('hoursOn with a calendar', () => {
  it('SG closes on National Day when the setting is "closed"', () => {
    expect(hoursOn({ hours: closedOnHolidays, calendar: 'SG' }, '2027-08-09')).toMatchObject({ closed: true, source: 'holiday', holiday: { en: 'National Day' } })
  })
  it('SG does not close on the Austrian National Day', () => {
    expect(hoursOn({ hours: closedOnHolidays, calendar: 'SG' }, '2026-10-26')).toMatchObject({ closed: false, source: 'week' })
  })
  it('"none" never marks a holiday, not even 25 December', () => {
    expect(hoursOn({ hours: closedOnHolidays, calendar: 'none' }, '2026-12-25')).toMatchObject({ closed: false, source: 'week' })
  })
  it('without a calendar Austria still counts', () => {
    expect(hoursOn({ hours: closedOnHolidays }, '2026-10-26')).toMatchObject({ closed: true, source: 'holiday' })
  })
  it('a custom calendar function is used', () => {
    const calendar = (year: number) => [{ date: `${year}-03-03`, de: 'Hausfest', en: 'House party' }]
    expect(hoursOn({ hours: closedOnHolidays, calendar }, '2026-03-03')).toMatchObject({ closed: true, holiday: { en: 'House party' } })
  })
})
