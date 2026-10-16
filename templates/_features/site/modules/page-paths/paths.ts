// The address of each Vue page in every language, from ginko.config.ts, so a page and its links never disagree.
// A page in app/pages/ answers at its file path in the main language (`news/index.vue` at /news) and with the language
// prefix in the others (/de/news). When ginko.config.ts gives that page other words per language (`pages.news` is
// `/de/aktuelles` in German, or the legal route `/de/rechtliches/[slug]`), the page answers there instead:
//   1. a path of `pages` or of a brick `route` that is the file path in one of the languages: its paths in all of them;
//   2. else a key of `pages` named like the file's first folder (`news/[slug].vue` and `pages.news`): that page's path
//      per language, followed by the rest of the file path (`/de/aktuelles/[slug]`). A part of that rest that
//      `segments` in app/routes.ts has a word for is translated too (`menu/print.vue`: `/de/speisekarte/drucken`),
//      so a nested page can have its own word without a `pages` key (a key puts the page into the sitemap).
// So a feature page keeps its file name in every template, and a template renames it in ginko.config.ts alone
// (app/routes.ts). A page whose definePageMeta sets `i18n` keeps its own paths.
// This file is the pure part (unit tested); index.ts is the Nuxt module.

type PathMap = Record<string, string | undefined>
/** `segments` of app/routes.ts: the word of a path part per language. */
export type Segments = Record<string, Record<string, string | undefined> | undefined>
export interface SiteConfig { locales: readonly string[], pages?: Record<string, PathMap>, bricks?: Record<string, { route?: PathMap }> }

/** `/news/:slug()` (Nuxt) ↔ `/news/[slug]` (ginko.config.ts). */
export const toConfig = (path: string) => path.replace(/:(\w+)\(\)/g, '[$1]')
export const toNuxt = (path: string) => path.replace(/\[(\w+)\]/g, ':$1()')

/**
 * The path of a page file (`/menu/print`, `/news/[slug]`) per language without the language prefix, or undefined when
 * ginko.config.ts and `segments` give it none (the page then answers at its file path).
 */
export function pagePaths(site: SiteConfig, segments: Segments, file: string): Record<string, string> | undefined {
  const [main] = site.locales
  /** A configured path without its language prefix: `/de/aktuelles` → `/aktuelles`. */
  const bare = (locale: string, path: string) => {
    if (locale === main) return path
    if (path === `/${locale}`) return '/'
    return path.startsWith(`/${locale}/`) ? path.slice(locale.length + 1) : path
  }
  const maps = [...Object.values(site.pages ?? {}), ...Object.values(site.bricks ?? {}).flatMap((brick) => (brick.route ? [brick.route] : []))]
  const exact = maps.find((map) => site.locales.some((locale) => map[locale] !== undefined && bare(locale, map[locale]!) === file))
  if (exact) return Object.fromEntries(site.locales.flatMap((locale) => (exact[locale] ? [[locale, bare(locale, exact[locale]!)]] : [])))
  const [, key, ...rest] = file.split('/')
  const page = key ? site.pages?.[key] : undefined
  if (!page) return undefined
  return Object.fromEntries(site.locales.flatMap((locale) => {
    const base = page[locale] === undefined ? undefined : bare(locale, page[locale]!)
    if (base === undefined) return []
    const tail = rest.map((part) => `/${segments[part]?.[locale] ?? part}`).join('')
    return [[locale, `${base === '/' ? '' : base}${tail}` || '/']]
  }))
}
