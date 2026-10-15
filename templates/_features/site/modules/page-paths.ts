import { defineNuxtModule } from 'nuxt/kit'

// The address of each Vue page in every language, from ginko.config.ts, so a page and its links never disagree.
// A page in app/pages/ answers at its file path in the main language (`news/index.vue` at /news) and with the language
// prefix in the others (/de/news). When ginko.config.ts gives that page other words per language (`pages.news` is
// `/de/aktuelles` in German, or the legal route `/de/rechtliches/[slug]`), the page answers there instead:
//   1. a path of `pages` or of a brick `route` that is the file path in one of the languages: its paths in all of them;
//   2. else a key of `pages` named like the file's first folder (`news/[slug].vue` and `pages.news`): that page's path
//      per language, followed by the rest of the file path (`/de/aktuelles/[slug]`).
// So a feature page keeps its file name in every template, and a template renames it in ginko.config.ts alone
// (app/routes.ts). A page whose definePageMeta sets `i18n` keeps its own paths.

type PathMap = Record<string, string | undefined>
interface SiteConfig { locales: readonly string[], pages?: Record<string, PathMap>, bricks?: Record<string, { route?: PathMap }> }

/** `/news/:slug()` (Nuxt) ↔ `/news/[slug]` (ginko.config.ts). */
const toConfig = (path: string) => path.replace(/:(\w+)\(\)/g, '[$1]')
const toNuxt = (path: string) => path.replace(/\[(\w+)\]/g, ':$1()')

export default defineNuxtModule({
  meta: { name: 'page-paths' },
  setup(_options, nuxt) {
    const site = (nuxt.options as { ginko?: SiteConfig }).ginko
    if (!site?.locales.length) return
    const [main] = site.locales
    /** A configured path without its language prefix: `/de/aktuelles` → `/aktuelles`. */
    const bare = (locale: string, path: string) => {
      if (locale === main) return path
      if (path === `/${locale}`) return '/'
      return path.startsWith(`/${locale}/`) ? path.slice(locale.length + 1) : path
    }
    const maps = [...Object.values(site.pages ?? {}), ...Object.values(site.bricks ?? {}).flatMap((brick) => (brick.route ? [brick.route] : []))]

    /** The page's path per language, or undefined when ginko.config.ts gives it none. */
    function pathsOf(file: string): Record<string, string> | undefined {
      const exact = maps.find((map) => site!.locales.some((locale) => map[locale] !== undefined && bare(locale, map[locale]!) === file))
      if (exact) return Object.fromEntries(site!.locales.flatMap((locale) => (exact[locale] ? [[locale, bare(locale, exact[locale]!)]] : [])))
      const [, key, ...rest] = file.split('/')
      const page = key ? site!.pages?.[key] : undefined
      if (!page) return undefined
      const tail = rest.length ? `/${rest.join('/')}` : ''
      return Object.fromEntries(site!.locales.flatMap((locale) => {
        const base = page[locale] === undefined ? undefined : bare(locale, page[locale]!)
        return base === undefined ? [] : [[locale, `${base === '/' ? '' : base}${tail}` || '/']]
      }))
    }

    nuxt.hook('pages:extend', (pages) => {
      for (const page of pages) {
        if (page.meta?.i18n !== undefined) continue
        const file = toConfig(page.path)
        const paths = pathsOf(file)
        if (!paths || Object.values(paths).every((path) => path === file)) continue
        page.meta = { ...page.meta, i18n: { paths: Object.fromEntries(Object.entries(paths).map(([locale, path]) => [locale, toNuxt(path)])) } }
      }
    })
  },
})
