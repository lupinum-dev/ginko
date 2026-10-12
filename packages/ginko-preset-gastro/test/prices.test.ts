// A guest must see the price that applies today, and the owner's new price must not show a day early or stay hidden after its date.
import { describe, expect, it } from 'vitest'
import { priceOn, upcomingPrice } from '../src/prices.ts'

const old = { amount: 1850 }
const next = { amount: 1950 }
const item = { price: old, nextPrice: next, priceFrom: '2026-11-01' }

describe('priceOn', () => {
  it.each([
    ['the day before priceFrom: old price', item, '2026-10-31', old],
    ['on priceFrom: new price', item, '2026-11-01', next],
    ['after priceFrom: new price', item, '2027-01-15', next],
    ['no nextPrice: old price whatever the date', { price: old, priceFrom: '2026-11-01' }, '2026-12-01', old],
    ['no priceFrom: old price (a new price without a date is not live)', { price: old, nextPrice: next }, '2026-12-01', old],
    ['nothing planned', { price: old }, '2026-12-01', old],
  ] as const)('%s', (_name, i, date, expected) => {
    expect(priceOn(i, date)).toEqual(expected)
  })
})

describe('upcomingPrice', () => {
  it.each([
    ['change in 14 days is announced', item, '2026-10-18', { from: '2026-11-01', price: next }],
    ['change in 15 days is not yet', item, '2026-10-17', undefined],
    ['change today is already the price, not an announcement', item, '2026-11-01', undefined],
    ['change in the past: nothing', item, '2026-11-20', undefined],
    ['nothing planned', { price: old }, '2026-10-30', undefined],
  ] as const)('%s', (_name, i, today, expected) => {
    expect(upcomingPrice(i, today, 14)).toEqual(expected)
  })
})
