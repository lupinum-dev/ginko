// A price that changes on a date: the owner enters it ahead of time and the site switches by itself.

export interface Money { amount: number; currency?: string }
export interface PricedItem<M extends Money = Money> { price: M; nextPrice?: M; priceFrom?: string }

/** The price on `date`: `nextPrice` from `priceFrom` on (that day included), else `price`. Both fields are needed. */
export function priceOn<M extends Money>(item: PricedItem<M>, date: string): M {
  return item.nextPrice && item.priceFrom && date >= item.priceFrom ? item.nextPrice : item.price
}

/** The coming price change when it starts after `today` and within `days` days; else nothing. */
export function upcomingPrice<M extends Money>(item: PricedItem<M>, today: string, days: number): { from: string; price: M } | undefined {
  if (!item.nextPrice || !item.priceFrom || item.priceFrom <= today) return undefined
  const limit = new Date(`${today}T12:00:00Z`)
  limit.setUTCDate(limit.getUTCDate() + days)
  return item.priceFrom <= limit.toISOString().slice(0, 10) ? { from: item.priceFrom, price: item.nextPrice } : undefined
}
