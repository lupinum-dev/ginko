import { config } from '#ginko-i18n/config.mjs'
import { entries } from '#ginko-i18n/sitemap.mjs'
import { alternatesOf } from '@lupinum/ginko-i18n/core'

// Local shapes: @nuxtjs/sitemap is optional, so its types are not imported.
type Alternative = { hreflang: string, href: string }
type SitemapUrl = string | { loc: string, alternatives?: Alternative[] }
type ServerApp = { hooks: { hook: (name: 'sitemap:input', fn: (ctx: { urls: SitemapUrl[] }) => void) => void } }

const c = config
const alternativesByPath = new Map<string, Alternative[]>()
for (const paths of entries) {
  if (paths['*']) continue
  // The same hreflang rule as the head and Ginko's own /sitemap.xml.
  const alternatives = alternatesOf(paths, c).map(({ hreflang, path }) => ({ hreflang, href: path }))
  for (const path of Object.values(paths)) alternativesByPath.set(path, alternatives)
}

/**
 * We attach explicit alternates to the static pages we know, since the sitemap's `autoI18n` pairs
 * locales by stripping prefixes (wrong for translated slugs). Used on its own, the sitemap keeps its
 * page and prerender discovery; on a Ginko site, Ginko supplies every URL with its alternates (D13).
 * A plain function, not `defineNitroPlugin`, so it loads on Nitro 2 and 3.
 */
export default (app: ServerApp) => {
  app.hooks.hook('sitemap:input', (ctx) => {
    ctx.urls = ctx.urls.flatMap((url) => {
      const loc = typeof url === 'string' ? url : url.loc
      // With `prefix`, `/` only redirects to a locale; it is not a page.
      if (c.strategy === 'prefix' && loc === '/') return []
      const alternatives = alternativesByPath.get(loc)
      return alternatives ? [{ ...(typeof url === 'string' ? { loc: url } : url), alternatives }] : [url]
    })
  })
}
