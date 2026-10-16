// The site's own links outside Markdown (app.config nav, footer and banner, the start page's links and cards): their
// texts and their addresses.
import schema from '#ginko/schema'
import { docsRouteLink } from '../lib/docsPage'

export function useDocsSite() {
  const { t, localePath } = useI18n()
  const docs = useGinko('docs')
  const locale = useGinkoLocale()
  const { mainLocale } = useGinkoSite()
  const pages = schema.pages as Record<string, Partial<Record<string, string>> | undefined>
  const find = {
    doc: (ref: string) => docs.value.items.find((d) => d.id === `docs/${ref}` || d.data.slug === ref)?.url,
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
      if (raw.startsWith('$')) return docsRouteLink(raw, find) ?? raw
      return raw.startsWith('/') && !raw.startsWith('//') ? localePath(raw) : raw
    },
  }
}
