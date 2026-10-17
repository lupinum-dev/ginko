// The pure helpers behind what visitors read: a wrong certificate status, salary line or "open today" is a public mistake.
import { describe, expect, it } from 'vitest'
import { certStatus, exceptionsAhead, excerpt, formatSize, initials, salaryText, todayState, type DayHours, type Exception } from '../app/utils/site.ts'

const week: DayHours[] = [
  { day: 'mo', closed: false, from1: '07:00', to1: '12:00', from2: '12:30', to2: '16:00' },
  { day: 'fr', closed: false, from1: '07:00', to1: '12:00' },
  { day: 'sa', closed: true },
  { day: 'su', closed: true },
]
const holiday: Exception = { _id: 'x1', when: { from: '2026-10-26', to: '2026-10-26' }, reason: 'Nationalfeiertag', closed: true }
const winter: Exception = { _id: 'x2', when: { from: '2026-12-24', to: '2027-01-01' }, reason: 'Betriebsferien', closed: true }

describe('certStatus', () => {
  it.each([
    ['months left is valid', '2027-03-14', '2026-10-09', 'valid'],
    ['exactly 60 days left is still valid', '2026-12-08', '2026-10-09', 'valid'],
    ['59 days left expires soon', '2026-12-07', '2026-10-09', 'soon'],
    ['the last day is still valid, as "soon"', '2026-10-09', '2026-10-09', 'soon'],
    ['the day after the last day is expired', '2026-10-08', '2026-10-09', 'expired'],
  ] as const)('%s', (_name, validUntil, today, expected) => {
    expect(certStatus(validUntil, today)).toBe(expected)
  })
})

describe('todayState', () => {
  it.each([
    ['a Monday shows both time spans', { week, exceptions: [] }, '2026-10-05', { kind: 'open', times: '07:00–12:00 und 12:30–16:00' }],
    ['a Friday with one span shows one', { week, exceptions: [] }, '2026-10-09', { kind: 'open', times: '07:00–12:00' }],
    ['Saturday is the weekend', { week, exceptions: [] }, '2026-10-10', { kind: 'weekend' }],
    ['the "closed today" switch beats the weekly plan', { week, exceptions: [], closedOn: '2026-10-05', closedNote: 'Betriebsversammlung' }, '2026-10-05', { kind: 'closed', reason: 'Betriebsversammlung', field: 'closedNote' }],
    ['a switch set for yesterday no longer counts', { week, exceptions: [], closedOn: '2026-10-04' }, '2026-10-05', { kind: 'open', times: '07:00–12:00 und 12:30–16:00' }],
    ['a closure over New Year covers 31 December', { week: [...week, { day: 'th', closed: false, from1: '07:00', to1: '12:00' }], exceptions: [winter] }, '2026-12-31', { kind: 'closed', reason: 'Betriebsferien', field: 'exceptions.x2.reason' }],
  ] as const)('%s', (_name, hours, today, expected) => {
    expect(todayState(hours as never, today, 'und')).toEqual(expected)
  })
})

describe('exceptionsAhead', () => {
  it('keeps running and near exceptions, drops far and past ones', () => {
    const past: Exception = { _id: 'x0', when: { from: '2026-09-01', to: '2026-09-02' }, reason: 'vorbei', closed: true }
    expect(exceptionsAhead({ exceptions: [winter, holiday, past] }, '2026-10-09', 60).map((e) => e._id)).toEqual(['x1'])
    expect(exceptionsAhead({ exceptions: [winter, holiday] }, '2026-12-26', 60).map((e) => e._id)).toEqual(['x2'])
  })

  // Wrong behaviour caught: a day set in "Geschlossen am" for tomorrow was on the website only once it was today.
  it.each([
    ['tomorrow is listed, with its note and the note\'s field', '2026-10-10', [{ _id: 'closedOn', when: { from: '2026-10-10', to: '2026-10-10' }, reason: 'Betriebsversammlung', closed: true, field: 'closedNote' }, { ...holiday, field: 'exceptions.x1.reason' }]],
    ['today is the board\'s state, not listed', '2026-10-09', [{ ...holiday, field: 'exceptions.x1.reason' }]],
    ['beyond the 60 days it waits', '2026-12-20', [{ ...holiday, field: 'exceptions.x1.reason' }]],
  ])('closedOn: %s', (_name, closedOn, expected) => {
    expect(exceptionsAhead({ exceptions: [holiday], closedOn, closedNote: 'Betriebsversammlung' }, '2026-10-09', 60)).toEqual(expected)
  })
})

describe('text helpers', () => {

  it('states the salary with period and currency style of the language', () => {
    expect(salaryText({ salary: { amount: 280000, currency: 'EUR' }, salaryPeriod: 'month' }, 'de', 'de-AT', { from: 'ab', gross: 'brutto' })).toBe('ab\u00a0€\u00a02.800\u00a0brutto\u00a0/\u00a0Monat')
    expect(salaryText({ salary: { amount: 2400000, currency: 'EUR' }, salaryPeriod: 'year' }, 'en', 'en-GB', { from: 'from', gross: 'gross' })).toBe('from €24,000 gross / year')
    // Cents stay when there are some.
    expect(salaryText({ salary: { amount: 280050, currency: 'EUR' }, salaryPeriod: 'month' }, 'de', 'de-AT', { from: 'ab', gross: 'brutto' })).toContain('2.800,50')
  })

  it('formats file sizes from bytes', () => {
    expect(formatSize(504220, 'de')).toBe('492 KB')
    expect(formatSize(1_300_000, 'de')).toBe('1,2 MB')
    expect(formatSize(1_300_000, 'en')).toBe('1.2 MB')
  })

  it('cuts an excerpt at a word and marks the cut', () => {
    const doc = { nodes: [['p', {}, 'Wort '.repeat(60)]] }
    const short = excerpt(doc, 160)
    expect(short.endsWith('Wort…')).toBe(true)
    expect(short.length).toBeLessThanOrEqual(161)
    expect(excerpt({ nodes: [['p', {}, 'Kurz.']] })).toBe('Kurz.')
  })

  it('takes initials without the title', () => {
    expect(initials('Dr. Eva Brunner')).toBe('EB')
    expect(initials('Markus Leitner')).toBe('ML')
    expect(initials('Madonna')).toBe('M')
  })

})
