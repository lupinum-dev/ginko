import { getRequestURL } from 'nuxt/server'
import { config } from '#ginko-i18n/config.mjs'
import { requestLocale } from '../locale'

// Local shapes: nuxt-site-config is optional, so its types are not imported.
type SiteConfigInit = { event: Parameters<typeof getRequestURL>[0], siteConfig: { push: (input: Record<string, unknown>) => void } }
type ServerApp = { hooks: { hook: (name: 'site-config:init', fn: (ctx: SiteConfigInit) => void) => void } }

const c = config
const languageOf = (code: string) => c.locales.find(l => l.code === code)?.language ?? code

/**
 * nuxt-site-config (installed with the Nuxt SEO modules) builds the site's settings per request, before the
 * middleware runs. Its language is the one ginko-i18n renders: nuxt-seo-utils writes `<html lang>` and og:locale
 * from it, nuxt-schema-org the WebSite's language. Without nuxt-site-config the hook never fires. A plain function,
 * not `defineNitroPlugin`, so it loads on Nitro 2 and 3.
 */
export default (app: ServerApp) => {
  app.hooks.hook('site-config:init', ({ event, siteConfig }) => {
    const path = getRequestURL(event).pathname.slice(c.base.length) || '/'
    siteConfig.push({ _context: 'ginko-i18n', currentLocale: languageOf(requestLocale(event, path)), defaultLocale: languageOf(c.defaultLocale) })
  })
}
