// The site's own links outside Markdown (app.config nav, footer and banner, the start page's links and cards): their
// texts and their addresses.
import schema from '#ginko/schema'
import { docsMainPath, docsRouteLink } from '../lib/docsPage'

export function useDocsSite() {
  const { t, localePath } = useI18n()
  const docs = useGinko('docs')
  const locale = useGinkoLocale()
  const { mainLocale } = useGinkoSite()
  const pages = schema.pages as Record<string, Partial<Record<string, string>> | undefined>
  const docsRoute = (schema.bricks as Record<string, { route?: Partial<Record<string, string>> } | undefined>).docs?.route
  const find = {
    // A page the current language lacks leads to its main-language page.
    doc: (ref: string) => docs.value.items.find((d) => d.id === `docs/${ref}` || d.data.slug === ref)?.url ?? docsMainPath(docsRoute, mainLocale, ref),
    page: (key: string) => pages[key]?.[locale.value] ?? pages[key]?.[mainLocale],
  }
  return {
    /** A message key the site defines (`docs.nav.<id>`, `docs.footer.<id>`, `docs.banner.<id>`); the layer's types do not know them. */
    text: t as (key: string) => string,
    /**
     * An address in the reader's language: a route link (`$docs.<page>`, `$page.<key>`) becomes the page's path, an
     * internal path gets the language prefix; an absolute URL, a mail link or an anchor stays as written.
     */
    href: (raw: string) => {
      // A route link that names nothing never becomes an address: it would be a relative link to a 404.
      if (raw.startsWith('$')) return docsRouteLink(raw, find) ?? localePath('/')
      return raw.startsWith('/') && !raw.startsWith('//') ? localePath(raw) : raw
    },
  }
}
