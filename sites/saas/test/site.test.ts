// The words around the content must not break the facts: dates, prices and tags that a visitor reads.
import { describe, expect, it } from 'vitest'
import { formatShortDate, planPrice, priceText, tagLabel, labels } from '../app/utils/site.ts'

const eur = (amount: number) => ({ amount, currency: 'EUR' as const })
const chf = (amount: number) => ({ amount, currency: 'CHF' as const })

describe('formatShortDate', () => {
  it.each([
    ['de', '2026-10-01', '1.10.2026'],
    ['en', '2026-10-01', '1 Oct 2026'],
    ['fr', '2026-10-01', '1 oct. 2026'],
    ['en', '2026-09-22', '22 Sep 2026'],
    ['de', '2026-12-31', '31.12.2026'],
  ] as const)('%s %s', (lang, date, expected) => {
    expect(formatShortDate(date, lang)).toBe(expected)
  })
})

describe('planPrice', () => {
  const plan = { priceEur: eur(2900), priceChf: chf(3200), yearEur: eur(29000), yearChf: chf(32000) }
  it.each([
    ['month', 'EUR', eur(2900)],
    ['month', 'CHF', chf(3200)],
    ['year', 'EUR', eur(29000)],
    ['year', 'CHF', chf(32000)],
  ] as const)('%s %s', (period, currency, expected) => {
    expect(planPrice(plan, period, currency)).toEqual(expected)
  })

  it('a plan without a yearly price has none in yearly mode (the page then says "nur monatlich")', () => {
    const monthlyOnly = { priceEur: eur(2900), priceChf: chf(3200) }
    expect(planPrice(monthlyOnly, 'year', 'CHF')).toBeUndefined()
    expect(planPrice(monthlyOnly, 'month', 'CHF')).toEqual(chf(3200))
  })
})

describe('tagLabel', () => {
  it('names the known tags per language and shows an unknown one as it is', () => {
    expect(tagLabel('new', labels.de.tags)).toBe('Neu')
    expect(tagLabel('fixed', labels.fr.tags)).toBe('Corrigé')
    expect(tagLabel('security', labels.en.tags)).toBe('security')
    // A value like "constructor" must not read from the object prototype.
    expect(tagLabel('constructor', labels.en.tags)).toBe('constructor')
  })
})

// Whole prices read "29 €" / "32 CHF" in German; a price with cents keeps them, so nothing is rounded away.
it.each([
  [{ amount: 2900, currency: 'EUR' as const }, 'de-DE', /^29\s€$/],
  [{ amount: 3200, currency: 'CHF' as const }, 'de-DE', /^32\sCHF$/],
  [{ amount: 2950, currency: 'EUR' as const }, 'de-DE', /^29,50\s€$/],
  [{ amount: 10900, currency: 'EUR' as const }, 'en-GB', /^€109$/],
])('priceText(%o, %s)', (money, language, expected) => {
  expect(priceText(money, language)).toMatch(expected)
})
