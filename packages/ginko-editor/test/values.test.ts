import { describe, expect, it } from 'vitest'
import { currencySign, formatAmount, parseMoney } from '../src/values.ts'

describe('parseMoney / formatAmount', () => {
  // Wrong behaviour caught: yen read as cents, or "1.234" read as 1.23 euros in German.
  it.each([
    ['12,5', 'EUR', 'de', 1250],
    ['12.50', 'EUR', 'de', 1250],
    ['12', 'EUR', 'de', 1200],
    ['23,', 'EUR', 'de', 2300],
    ['1.234,50', 'EUR', 'de', 123450],
    ['1.234', 'EUR', 'de', 123400],
    ['12,50 €', 'EUR', 'de', 1250],
    ['CHF 12.50', 'CHF', 'de', 1250],
    ['12.50', 'EUR', 'en', 1250],
    ['1,234.50', 'EUR', 'en', 123450],
    ['1,250', 'JPY', 'en', 1250],
    ['1250', 'JPY', 'ja', 1250],
    ['12.345', 'KWD', 'en', 12345],
    ['12,345', 'KWD', 'de', 12345],
    ['12,505', 'EUR', 'de', null],
    ['12,5', 'JPY', 'de', null],
    ['-3', 'EUR', 'de', null],
    ['abc', 'EUR', 'de', null],
    ['', 'EUR', 'de', null],
  ] as const)('parseMoney(%j, %s, %s) = %j', (input, currency, locale, expected) => {
    expect(parseMoney(input, currency, locale)).toBe(expected)
  })

  it.each([
    [1250, 'EUR', 'de', '12,50'],
    [1250, 'EUR', 'en', '12.50'],
    [1250, 'JPY', 'ja', '1250'],
    [12345, 'KWD', 'de', '12,345'],
  ] as const)('formatAmount(%i, %s, %s) = %j', (amount, currency, locale, expected) => {
    expect(formatAmount(amount, currency, locale)).toBe(expected)
  })

  it('names the currency sign in the language', () => {
    expect(currencySign('EUR', 'de')).toBe('€')
    expect(currencySign('CHF', 'de')).toBe('CHF')
    expect(currencySign('JPY', 'en')).toBe('¥')
  })
})
