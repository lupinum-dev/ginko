import type { Money } from './infer.ts'

/**
 * Money is stored as an integer count of the currency's minor units (cents for EUR, whole yen for JPY).
 * `minorDigits` says how many decimals one unit has: 2 for EUR, 0 for JPY, 3 for KWD.
 */
export function minorDigits(currency: string): number {
  return new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits ?? 2
}

/**
 * The amount in the notation of `language`, a BCP 47 tag such as `de-AT` (use `useI18n().language`, not the URL
 * code): `12,50 €` in de, `€ 12,50` in de-AT, `€12.50` in en, `¥1,250` for JPY.
 * Every space is a no-break space: Node and browsers ship different ICU data (one uses a plain
 * space), so a server-rendered price would otherwise differ from the hydrated one.
 */
export function formatMoney(money: Money, language: string): string {
  const digits = minorDigits(money.currency)
  const text = new Intl.NumberFormat(language, { style: 'currency', currency: money.currency }).format(money.amount / 10 ** digits)
  return text.replace(/\s/g, ' ')
}
