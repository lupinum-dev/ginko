// The languages of this site and the web address of each page per language (TEMPLATES T8). The first language is
// the main one: its addresses have no prefix, the others start with /<code>. `npm create ginko -- --locales` edits
// the `locales` list and drops the dropped languages' entries from the maps below.
export const locales = ['en', 'de', 'fr', 'ar'] as const
export type SiteLocale = (typeof locales)[number]

/**
 * The words of the addresses, per language: `localized('/news/[slug]')` gives `/de/aktuelles/[slug]` in German. A
 * part of a path that is not listed here stays as it is. Slugs allow only a–z, 0–9 and `-`, so Arabic uses Latin
 * letters. To rename a section, change its word here; the pages and links follow.
 */
export const segments: Record<string, Partial<Record<SiteLocale, string>>> = {
  news: { en: 'news', de: 'aktuelles', fr: 'actualites', ar: 'akhbar' },
  events: { en: 'events', de: 'veranstaltungen', fr: 'evenements', ar: 'faaliyat' },
  projects: { en: 'projects', de: 'projekte', fr: 'projets', ar: 'mashari' },
  team: { en: 'team', de: 'team', fr: 'equipe', ar: 'fariq' },
  reports: { en: 'reports', de: 'berichte', fr: 'rapports', ar: 'taqarir' },
  legal: { en: 'legal', de: 'rechtliches', fr: 'informations-legales', ar: 'qanuni' },
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
