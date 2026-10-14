// nuxt-site-config (installed with the Nuxt SEO modules) builds the site's settings per request. A preview host is
// never indexable, as with Ginko's own robots.txt: @nuxtjs/robots then disallows everything and sends noindex.
// Without nuxt-site-config the hook never fires. A plain function, not `defineNitroPlugin`, so it loads on Nitro 2 and 3.
import { getRequestHost, useRuntimeConfig } from 'nuxt/server'
import { isPreviewHost } from '../../../internal.ts'
import type { GinkoPublicConfig } from '../shared.ts'

// Local shapes: nuxt-site-config is optional, so its types are not imported.
type SiteConfigInit = { event: Parameters<typeof getRequestHost>[0]; siteConfig: { push: (input: Record<string, unknown>) => void } }
type ServerApp = { hooks: { hook: (name: 'site-config:init', fn: (ctx: SiteConfigInit) => void) => void } }

export default (app: ServerApp) => {
  app.hooks.hook('site-config:init', ({ event, siteConfig }) => {
    // A static build (nuxt generate) has no request host: its output is meant for the site's own host.
    if (import.meta.prerender) return
    const { url } = useRuntimeConfig().public.ginko as GinkoPublicConfig
    if (isPreviewHost(getRequestHost(event), url)) siteConfig.push({ _context: 'ginko:preview-host', indexable: false })
  })
}
