// The languages of this site and the web address of each page per language (TEMPLATES T8). The first language is
// the main one: its addresses have no prefix, the others start with /<code>. `npm create ginko -- --locales` edits
// the `locales` list and drops the entries of removed languages from the maps below.
export const locales = ['en', 'de', 'it'] as const
export type SiteLocale = (typeof locales)[number]

/**
 * The words of the addresses, per language: `localized('/menu/print')` gives `/de/speisekarte/drucken` in German. A
 * part of a path that is not listed here stays as it is. Slugs allow only a–z, 0–9 and `-`. To rename a section,
 * change its word here; the pages and links follow (`modules/page-paths/` reads this table for the page files).
 */
export const segments: Record<string, Partial<Record<SiteLocale, string>>> = {
  menu: { en: 'menu', de: 'speisekarte', it: 'menu' },
  print: { en: 'print', de: 'drucken', it: 'stampa' },
  lunch: { en: 'lunch', de: 'mittagsmenue', it: 'pranzo' },
  events: { en: 'events', de: 'veranstaltungen', it: 'eventi' },
  gallery: { en: 'gallery', de: 'galerie', it: 'galleria' },
  reservations: { en: 'reservations', de: 'reservierung', it: 'prenotazioni' },
  legal: { en: 'legal', de: 'rechtliches', it: 'legale' },
}

/** The path prefix of a language: none for the main language, `/de` for German as a second language. */
export const prefix = (locale: SiteLocale) => (locale === locales[0] ? '' : `/${locale}`)

/** A path of `localized`: a route keeps its `[slug]`, so the result still fits a collection's `route`. */
type Localized<P extends string> = P extends `${string}[slug]${string}` ? `/${string}[slug]${string}` : `/${string}`

/** One address per language from a path in its English form, with the words of `segments`: `localized('/news')`. */
export function localized<const P extends `/${string}`>(path: P): Record<SiteLocale, Localized<P>> {
  const words = (locale: SiteLocale) => path.split('/').map((part) => segments[part]?.[locale] ?? part).join('/')
  // Object.fromEntries loses the key and value types; the keys are exactly `locales`, and the words never touch `[slug]`.
  return Object.fromEntries(locales.map((locale) => [locale, String(path) === '/' ? prefix(locale) || '/' : `${prefix(locale)}${words(locale)}`])) as Record<SiteLocale, Localized<P>>
}
