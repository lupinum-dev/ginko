// Translatable labels and the open lists of languages and currencies (SPEC 2.1).
import type { Currency, Label, Locale } from './types.ts'

/** Most content languages one site can have. */
export const MAX_LOCALES = 20

/**
 * A content language: a BCP-47 tag that `Intl.getCanonicalLocales` accepts and that is already canonical
 * (`es`, `pt-BR`, `zh-Hant`; not `EN-us` or `pt_BR`). Runtime check for `Locale`, which is a plain string.
 */
export function isLocale(value: unknown): value is Locale {
  if (typeof value !== 'string' || value === '') return false
  try {
    const canonical = Intl.getCanonicalLocales(value)
    return canonical.length === 1 && canonical[0] === value
  } catch {
    return false
  }
}

let currencies: Set<string> | undefined

/** An ISO-4217 code (`EUR`, `JPY`, `SGD`) that this runtime's `Intl` knows. */
export function isCurrency(value: unknown): value is Currency {
  if (typeof value !== 'string' || !/^[A-Z]{3}$/.test(value)) return false
  currencies ??= new Set(Intl.supportedValuesOf('currency'))
  return currencies.has(value)
}

/**
 * The text of a label in `locale`: that language, else the main language, else English, else the first one given.
 * A plain string is the main language's text and is shown in every language.
 */
export function labelOf(label: Label, locale: string, main: string): string {
  if (typeof label === 'string') return label
  if (Object.hasOwn(label, locale)) return label[locale]!
  if (Object.hasOwn(label, main)) return label[main]!
  if (Object.hasOwn(label, 'en')) return label.en!
  return Object.values(label)[0] ?? ''
}

/** Two labels with the same texts (record key order does not matter). */
export function sameLabel(a: Label | undefined, b: Label | undefined): boolean {
  if (typeof a === 'string' || typeof b === 'string' || a === undefined || b === undefined) return a === b
  const keys = Object.keys(a)
  return keys.length === Object.keys(b).length && keys.every((k) => Object.hasOwn(b, k) && a[k] === b[k])
}

/**
 * Why a label is not valid, as an English sentence, or null. A string is always accepted (old schemas);
 * a record needs the main language and a text for every key, and its keys are content languages.
 */
export function labelProblem(path: string, label: unknown, main: string): string | null {
  if (typeof label === 'string') return null
  if (typeof label !== 'object' || label === null || Array.isArray(label)) return `${path}: label must be a text or an object with one text per language.`
  const record = label as Record<string, unknown>
  const bad = Object.keys(record).find((k) => !isLocale(k))
  if (bad !== undefined) return `${path}: label has the invalid language “${bad}”.`
  // English is the shared fallback, so labels from presets (`{ de, en }`) also work on a site in `es`.
  if (!Object.hasOwn(record, main) && !Object.hasOwn(record, 'en')) return `${path}: label needs a text in the main language “${main}” or in English.`
  if (Object.values(record).some((v) => typeof v !== 'string')) return `${path}: label needs a text for each language.`
  return null
}
