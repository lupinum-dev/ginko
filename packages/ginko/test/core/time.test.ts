import { describe, expect, it } from 'vitest'
import { formatMoney, isCurrency, minorDigits, resolveToken, todayIn, weekInfo, startOfWeek, workWeekOf, type SiteWeek } from '../../src/core/index.ts'

const MONDAY: SiteWeek = { firstDay: 'mo', workdays: ['mo', 'tu', 'we', 'th', 'fr'] }

describe('todayIn (SPEC 2.7, B7)', () => {
  // Wrong behaviour caught: "today" flips a day too early or late around midnight because it uses UTC instead of the site zone.
  it.each([
    ['2026-10-08T21:59:59Z', '2026-10-08'],
    ['2026-10-08T22:00:00Z', '2026-10-09'],
    ['2026-10-08T22:30:00Z', '2026-10-09'],
  ])('at %s in Europe/Vienna is %s', (now, expected) => {
    expect(todayIn('Europe/Vienna', new Date(now))).toBe(expected)
  })
})

describe('startOfWeek and workWeekOf (the week the site states)', () => {
  // Wrong behaviour caught: the week is hard-coded Monday-first with Saturday and Sunday off, so a US, Israeli or Egyptian
  // site starts its weeks, and plans the coming one, on the wrong day. Only the last workday decides the work week.
  // October 2026: Thu 8, Fri 9, Sat 10, Sun 11, Mon 12.
  it.each([
    // Monday first, weekend Sat+Sun, so both go to the coming week.
    [MONDAY, '2026-10-09', '2026-10-05', '2026-10-05'],
    [MONDAY, '2026-10-10', '2026-10-05', '2026-10-12'],
    [MONDAY, '2026-10-11', '2026-10-05', '2026-10-12'],
    [MONDAY, '2026-10-12', '2026-10-12', '2026-10-12'],
    // Sunday first, Monday to Friday (a US site): the calendar starts on Sunday, Friday is the last workday, so Saturday
    // already plans the coming week and Friday does not.
    [{ firstDay: 'su', workdays: ['mo', 'tu', 'we', 'th', 'fr'] }, '2026-10-09', '2026-10-04', '2026-10-04'],
    [{ firstDay: 'su', workdays: ['mo', 'tu', 'we', 'th', 'fr'] }, '2026-10-10', '2026-10-04', '2026-10-11'],
    [{ firstDay: 'su', workdays: ['mo', 'tu', 'we', 'th', 'fr'] }, '2026-10-11', '2026-10-11', '2026-10-11'],
    // Monday first, Tuesday to Saturday (a restaurant closed on Mondays): Saturday is the last workday, so Sunday plans
    // the coming week and Saturday does not.
    [{ firstDay: 'mo', workdays: ['tu', 'we', 'th', 'fr', 'sa'] }, '2026-10-10', '2026-10-05', '2026-10-05'],
    [{ firstDay: 'mo', workdays: ['tu', 'we', 'th', 'fr', 'sa'] }, '2026-10-11', '2026-10-05', '2026-10-12'],
    [{ firstDay: 'mo', workdays: ['tu', 'we', 'th', 'fr', 'sa'] }, '2026-10-12', '2026-10-12', '2026-10-12'],
    // Sunday first, Sunday to Friday: only Saturday goes to the coming one.
    [{ firstDay: 'su', workdays: ['su', 'mo', 'tu', 'we', 'th', 'fr'] }, '2026-10-09', '2026-10-04', '2026-10-04'],
    [{ firstDay: 'su', workdays: ['su', 'mo', 'tu', 'we', 'th', 'fr'] }, '2026-10-10', '2026-10-04', '2026-10-11'],
    [{ firstDay: 'su', workdays: ['su', 'mo', 'tu', 'we', 'th', 'fr'] }, '2026-10-11', '2026-10-11', '2026-10-11'],
    [{ firstDay: 'su', workdays: ['su', 'mo', 'tu', 'we', 'th', 'fr'] }, '2026-10-12', '2026-10-11', '2026-10-11'],
    // Sunday first, Sunday to Thursday (Israel), weekend Fri+Sat.
    [{ firstDay: 'su', workdays: ['su', 'mo', 'tu', 'we', 'th'] }, '2026-10-08', '2026-10-04', '2026-10-04'],
    [{ firstDay: 'su', workdays: ['su', 'mo', 'tu', 'we', 'th'] }, '2026-10-09', '2026-10-04', '2026-10-11'],
    [{ firstDay: 'su', workdays: ['su', 'mo', 'tu', 'we', 'th'] }, '2026-10-10', '2026-10-04', '2026-10-11'],
    [{ firstDay: 'su', workdays: ['su', 'mo', 'tu', 'we', 'th'] }, '2026-10-11', '2026-10-11', '2026-10-11'],
    // Saturday first, Saturday to Thursday (Egypt): Friday goes to the coming week, Saturday starts it.
    [{ firstDay: 'sa', workdays: ['sa', 'su', 'mo', 'tu', 'we', 'th'] }, '2026-10-08', '2026-10-03', '2026-10-03'],
    [{ firstDay: 'sa', workdays: ['sa', 'su', 'mo', 'tu', 'we', 'th'] }, '2026-10-09', '2026-10-03', '2026-10-10'],
    [{ firstDay: 'sa', workdays: ['sa', 'su', 'mo', 'tu', 'we', 'th'] }, '2026-10-10', '2026-10-10', '2026-10-10'],
    [{ firstDay: 'sa', workdays: ['sa', 'su', 'mo', 'tu', 'we', 'th'] }, '2026-10-11', '2026-10-10', '2026-10-10'],
  ] as const)('%o, %s: week starts %s, work week starts %s', (stated, date, start, work) => {
    const week = weekInfo(stated as SiteWeek)
    expect(startOfWeek(date, week)).toBe(start)
    expect(workWeekOf(date, week)).toBe(work)
  })

  // Wrong behaviour caught: the first day or the days off do not follow the stated week (a list of workdays, any days).
  it.each([
    [MONDAY, { firstDay: 1, weekend: [6, 7] }],
    [{ firstDay: 'su', workdays: ['su', 'mo', 'tu', 'we', 'th'] }, { firstDay: 7, weekend: [5, 6] }],
    [{ firstDay: 'sa', workdays: ['sa', 'su', 'mo', 'tu', 'we', 'th', 'fr'] }, { firstDay: 6, weekend: [] }],
    [{ firstDay: 'mo', workdays: ['tu', 'we', 'th', 'fr', 'sa'] }, { firstDay: 1, weekend: [1, 7] }],
  ] as const)('the days of %o', (stated, info) => {
    expect(weekInfo(stated as SiteWeek)).toEqual(info)
  })

  it('keeps year ends right', () => {
    expect(startOfWeek('2027-01-03', weekInfo(MONDAY))).toBe('2026-12-28')
  })
})

describe('resolveToken (SPEC 2.7)', () => {
  // Wrong behaviour caught: @today, @workWeek or @nextWorkWeek use UTC or the editor's device, so the prefill is a day off.
  it.each([
    ['2026-10-08T22:30:00Z', '@today', '2026-10-09'],
    ['2026-10-08T22:30:00Z', '@workWeek', '2026-10-05'],
    ['2026-10-08T22:30:00Z', '@nextWorkWeek', '2026-10-12'],
    ['2026-10-11T23:30:00Z', '@today', '2026-10-12'],
    ['2026-10-11T23:30:00Z', '@workWeek', '2026-10-12'],
    // Break-it 9: on the weekend the lunch week being planned is the coming one, not the week just over.
    ['2026-10-10T10:00:00Z', '@workWeek', '2026-10-12'],
    ['2026-10-11T10:00:00Z', '@workWeek', '2026-10-12'],
    ['2026-10-11T10:00:00Z', '@nextWorkWeek', '2026-10-19'],
    ['2026-10-09T21:59:00Z', '@workWeek', '2026-10-05'],
  ] as const)('at %s, %s is %s', (now, token, expected) => {
    expect(resolveToken(token, 'Europe/Vienna', MONDAY, new Date(now))).toBe(expected)
  })

  // Wrong behaviour caught: the tokens ignore the site's week and always answer Monday-first.
  it('uses the week of the site: a US site starts on Sunday', () => {
    const us: SiteWeek = { firstDay: 'su', workdays: ['su', 'mo', 'tu', 'we', 'th', 'fr'] }
    expect(resolveToken('@workWeek', 'America/New_York', us, new Date('2026-10-14T12:00:00Z'))).toBe('2026-10-11')
    expect(resolveToken('@nextWorkWeek', 'America/New_York', us, new Date('2026-10-14T12:00:00Z'))).toBe('2026-10-18')
  })

  // Wrong behaviour caught: an unknown token is silently turned into a value instead of being reported as unresolved.
  it('returns undefined for an unknown token', () => {
    expect(resolveToken('@tomorrow', 'Europe/Vienna', MONDAY, new Date('2026-10-08T12:00:00Z'))).toBeUndefined()
  })
})

describe('formatMoney (SPEC 8)', () => {
  // Node and browsers format with different spaces; a plain space made every price a hydration mismatch.
  it.each([
    [{ amount: 1250, currency: 'EUR' }, 'de', '12,50\u00a0€'],
    [{ amount: 1250, currency: 'EUR' }, 'en', '€12.50'],
    [{ amount: 1250, currency: 'CHF' }, 'de', '12,50\u00a0CHF'],
    [{ amount: 1250, currency: 'CHF' }, 'en', 'CHF\u00a012.50'],
    // Minor units follow the currency: yen has none, so 1250 is ¥1,250; dinar has three.
    [{ amount: 1250, currency: 'JPY' }, 'en', '¥1,250'],
    [{ amount: 1250, currency: 'KWD' }, 'en', 'KWD\u00a01.250'],
  ] as const)('%j in %s is %j, with no-break spaces only', (money, locale, expected) => {
    expect(formatMoney(money, locale)).toBe(expected)
  })

  // Wrong behaviour caught: "€390.00" on a price card, or a fractional price cut to whole units.
  it.each([
    [{ amount: 39000, currency: 'EUR' }, 'en', '€390'],
    [{ amount: 39000, currency: 'EUR' }, 'de', '390\u00a0€'],
    [{ amount: 1250, currency: 'EUR' }, 'en', '€12.50'],
    [{ amount: 1250, currency: 'JPY' }, 'en', '¥1,250'],
  ] as const)('%j in %s without minor units when whole: %j', (money, locale, expected) => {
    expect(formatMoney(money, locale, { wholeWithoutMinor: true })).toBe(expected)
  })
})

describe('currencies (SPEC 2.1)', () => {
  // Wrong behaviour caught: a yen price stored as cents (x100), or a made-up code accepted as a currency.
  it.each([['EUR', 2, true], ['JPY', 0, true], ['KWD', 3, true], ['SGD', 2, true], ['XXX', 2, false], ['eur', 2, false]] as const)('%s: %i minor digits, valid %s', (code, digits, valid) => {
    expect(isCurrency(code)).toBe(valid)
    if (valid) expect(minorDigits(code)).toBe(digits)
  })
})
