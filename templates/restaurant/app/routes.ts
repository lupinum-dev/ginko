// The languages of this site and the web address of each page per language (TEMPLATES T8). The first language is
// the main one: its addresses have no prefix, the others start with /<code>. `npm create ginko -- --locales` edits
// the `locales` list and drops the entries of removed languages from the maps below.
export const locales = ['en', 'de', 'it'] as const
export type SiteLocale = (typeof locales)[number]

/** The path prefix of a language: none for the main language, `/de` for German as a second language. */
export const prefix = (locale: SiteLocale) => (locale === locales[0] ? '' : `/${locale}`)

/** One address per language from a path in the main language's form: `localized('/[slug]')`. */
export function localized<const P extends `/${string}`>(path: P): Record<SiteLocale, P | `/${string}${P}`> {
  // Object.fromEntries loses the key and value types; the keys are exactly `locales`, the values `path` with a prefix.
  return Object.fromEntries(locales.map((locale) => [locale, String(path) === '/' ? prefix(locale) || '/' : `${prefix(locale)}${path}`])) as Record<SiteLocale, P | `/${string}${P}`>
}

/**
 * Translated addresses, without the language prefix. The key is the address of the page file in app/pages/ (the
 * English form); each language may give its own. A language without an entry keeps the key. Read by ginko.config.ts
 * (pages and routes) and nuxt.config.ts (the page files), so every address is written once.
 */
export const slugs: Record<`/${string}`, Partial<Record<SiteLocale, `/${string}`>>> = {
  '/menu': { de: '/speisekarte', it: '/menu' },
  '/menu/print': { de: '/speisekarte/drucken', it: '/menu/stampa' },
  '/lunch': { de: '/mittagsmenue', it: '/pranzo' },
  '/events': { de: '/veranstaltungen', it: '/eventi' },
  '/gallery': { de: '/galerie', it: '/galleria' },
  '/reservations': { de: '/reservierung', it: '/prenotazioni' },
  '/legal': { de: '/rechtliches', it: '/legale' },
}

/** The address of a page file in one language, without the prefix: the longest translated start wins. */
export function translatedPath(path: string, locale: SiteLocale): string {
  const start = Object.keys(slugs).filter((key) => path === key || path.startsWith(`${key}/`)).sort((a, b) => b.length - a.length)[0]
  const own = start ? slugs[start as `/${string}`]?.[locale] : undefined
  return start && own ? `${own}${path.slice(start.length)}` : path
}

/** A translated path keeps its `[slug]`, so a collection route stays a route. */
type Translated<P extends string> = P extends `${string}[slug]${string}` ? `/${string}[slug]${string}` : `/${string}`

/** One address per language for a page file's path, with prefixes: `translated('/events/[slug]')`. */
export function translated<const P extends `/${string}`>(path: P): Record<SiteLocale, Translated<P>> {
  // Same as `localized`: the keys are exactly `locales`, and a slug table never translates `[slug]` away.
  return Object.fromEntries(locales.map((locale) => [locale, `${prefix(locale)}${translatedPath(path, locale)}`])) as Record<SiteLocale, Translated<P>>
}
