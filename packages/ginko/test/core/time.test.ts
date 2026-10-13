import { describe, expect, it } from 'vitest'
import { DEFAULT_WEEK, formatMoney, isCurrency, minorDigits, resolveToken, todayIn, weekInfoOf, startOfWeek, workWeekOf } from '../../src/core/index.ts'

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

describe('startOfWeek and workWeekOf (week info of the language)', () => {
  // Wrong behaviour caught: the week is hard-coded Monday-first with Saturday and Sunday off, so a US, Israeli or Egyptian
  // site starts its weeks, and plans the coming one, on the wrong day.
  // October 2026: Thu 8, Fri 9, Sat 10, Sun 11, Mon 12.
  it.each([
    // de-AT: Monday first, weekend Sat+Sun, so both go to the coming week.
    ['de-AT', '2026-10-09', '2026-10-05', '2026-10-05'],
    ['de-AT', '2026-10-10', '2026-10-05', '2026-10-12'],
    ['de-AT', '2026-10-11', '2026-10-05', '2026-10-12'],
    ['de-AT', '2026-10-12', '2026-10-12', '2026-10-12'],
    // en-US: Sunday first, weekend Sat+Sun: Saturday is the last day of the week, so only Saturday goes to the coming one.
    ['en-US', '2026-10-09', '2026-10-04', '2026-10-04'],
    ['en-US', '2026-10-10', '2026-10-04', '2026-10-11'],
    ['en-US', '2026-10-11', '2026-10-11', '2026-10-11'],
    ['en-US', '2026-10-12', '2026-10-11', '2026-10-11'],
    // he: Sunday first, weekend Fri+Sat.
    ['he', '2026-10-08', '2026-10-04', '2026-10-04'],
    ['he', '2026-10-09', '2026-10-04', '2026-10-11'],
    ['he', '2026-10-10', '2026-10-04', '2026-10-11'],
    ['he', '2026-10-11', '2026-10-11', '2026-10-11'],
    // ar-EG: Saturday first, weekend Fri+Sat: Friday goes to the coming week, Saturday starts it.
    ['ar-EG', '2026-10-08', '2026-10-03', '2026-10-03'],
    ['ar-EG', '2026-10-09', '2026-10-03', '2026-10-10'],
    ['ar-EG', '2026-10-10', '2026-10-10', '2026-10-10'],
    ['ar-EG', '2026-10-11', '2026-10-10', '2026-10-10'],
  ])('%s, %s: week starts %s, work week starts %s', (language, date, start, work) => {
    const week = weekInfoOf(language)
    expect(startOfWeek(date, week)).toBe(start)
    expect(workWeekOf(date, week)).toBe(work)
  })

  // Wrong behaviour caught: the owner's `firstDayOfWeek` is ignored, or a language without data breaks the schema build.
  it('takes the first day from firstDayOfWeek when set, and falls back to Monday-first for an unknown tag', () => {
    expect(weekInfoOf('de-AT', 7)).toEqual({ firstDay: 7, weekend: [6, 7] })
    expect(weekInfoOf('not a tag')).toEqual({ firstDay: 1, weekend: [6, 7] })
  })

  it('keeps year ends right', () => {
    expect(startOfWeek('2027-01-03', weekInfoOf('de-AT'))).toBe('2026-12-28')
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
    expect(resolveToken(token, 'Europe/Vienna', DEFAULT_WEEK, new Date(now))).toBe(expected)
  })

  // Wrong behaviour caught: the tokens ignore the site's week and always answer Monday-first.
  it('uses the week of the site: en-US starts on Sunday', () => {
    const us = weekInfoOf('en-US')
    expect(resolveToken('@workWeek', 'America/New_York', us, new Date('2026-10-14T12:00:00Z'))).toBe('2026-10-11')
    expect(resolveToken('@nextWorkWeek', 'America/New_York', us, new Date('2026-10-14T12:00:00Z'))).toBe('2026-10-18')
  })

  // Wrong behaviour caught: an unknown token is silently turned into a value instead of being reported as unresolved.
  it('returns undefined for an unknown token', () => {
    expect(resolveToken('@tomorrow', 'Europe/Vienna', DEFAULT_WEEK, new Date('2026-10-08T12:00:00Z'))).toBeUndefined()
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
})

describe('currencies (SPEC 2.1)', () => {
  // Wrong behaviour caught: a yen price stored as cents (x100), or a made-up code accepted as a currency.
  it.each([['EUR', 2, true], ['JPY', 0, true], ['KWD', 3, true], ['SGD', 2, true], ['XXX', 2, false], ['eur', 2, false]] as const)('%s: %i minor digits, valid %s', (code, digits, valid) => {
    expect(isCurrency(code)).toBe(valid)
    if (valid) expect(minorDigits(code)).toBe(digits)
  })
})
