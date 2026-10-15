// The languages of this site and the web address of each page per language (TEMPLATES T8). The first language is
// the main one: its addresses have no prefix, the others start with /<code>. `npm create ginko -- --locales` edits
// the `locales` list; a map of slugs per language added here loses the entries of dropped languages too.
export const locales = ['en', 'de'] as const
export type SiteLocale = (typeof locales)[number]

/** The path prefix of a language: none for the main language, `/de` for German as a second language. */
export const prefix = (locale: SiteLocale) => (locale === locales[0] ? '' : `/${locale}`)

/** One address per language from a path in the main language's form: `localized('/legal/[slug]')`. */
export function localized<const P extends `/${string}`>(path: P): Record<SiteLocale, P | `/${string}${P}`> {
  // Object.fromEntries loses the key and value types; the keys are exactly `locales`, the values `path` with a prefix.
  return Object.fromEntries(locales.map((locale) => [locale, String(path) === '/' ? prefix(locale) || '/' : `${prefix(locale)}${path}`])) as Record<SiteLocale, P | `/${string}${P}`>
}
