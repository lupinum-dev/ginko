// Helpers the field components share. The storage format is the server's (SPEC 2.2); these only
// translate it for people and back.
import { minorDigits } from '@lupinum/ginko/internal'

// The rule lives in core, where the platform's list search reads it too.
export { textIn } from '@lupinum/ginko/internal'

/** A list row id: 10 characters, as the server expects (SPEC 2.2 list). */
export function newRowId(): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  const bytes = crypto.getRandomValues(new Uint8Array(10))
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('')
}

/** The decimal separator of a language ("," in de, "." in en). */
function decimalMark(locale: string): string {
  return new Intl.NumberFormat(locale).formatToParts(1.1).find((p) => p.type === 'decimal')?.value ?? '.'
}

/** The currency's sign in a language ("€", "CHF", "¥", "S$"). */
export function currencySign(currency: string, locale: string): string {
  return new Intl.NumberFormat(locale, { style: 'currency', currency }).formatToParts(0).find((p) => p.type === 'currency')?.value ?? currency
}

/**
 * What a person typed → the amount in minor units of `currency` (cents for EUR, whole yen for JPY), or null.
 * In de "12,5", "12.50", "12", "12," and "1.234,50" all read; the sign or the code of the currency may be typed too.
 * The language's decimal mark is always a decimal. The other mark is a decimal when it stands alone and at most as many
 * digits follow as the currency has ("12.50"), else it groups thousands ("1.234").
 */
export function parseMoney(input: string, currency: string, locale: string): number | null {
  const digits = minorDigits(currency)
  const text = input.trim().replace(/\s/g, '').replace(currencySign(currency, locale), '').replace(currency, '')
  if (!/^[\d.,]+$/.test(text)) return null
  const marks = text.match(/[.,]/g) ?? []
  const kind = marks[marks.length - 1]
  let mark: string | undefined
  if (kind !== undefined) {
    const alone = marks.every((m) => m === kind)
    const after = text.length - text.lastIndexOf(kind) - 1
    // "1.234,50": the last mark is the decimal when two kinds appear; one kind twice is only grouping.
    if (!alone) mark = kind
    else if (marks.length === 1 && (kind === decimalMark(locale) || (digits > 0 && after <= digits))) mark = kind
  }
  const at = mark === undefined ? text.length : text.lastIndexOf(mark)
  const whole = text.slice(0, at).replace(/[.,]/g, '')
  const fraction = text.slice(at + 1)
  // "23," and "23." while typing are 23,00: the decimals may still come.
  if (!/^\d+$/.test(whole) || !/^\d*$/.test(fraction) || fraction.length > digits) return null
  return Math.round(Number(`${whole}.${fraction || '0'}`) * 10 ** digits)
}

/** 1250 EUR in de → "12,50" (the input format; the currency is shown next to the field). */
export function formatAmount(amount: number, currency: string, locale: string): string {
  const digits = minorDigits(currency)
  return (amount / 10 ** digits).toFixed(digits).replace('.', decimalMark(locale))
}
