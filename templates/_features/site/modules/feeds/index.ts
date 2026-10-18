import { existsSync, readdirSync } from 'node:fs'
import { defineNuxtModule } from 'nuxt/kit'
import { feedRoutes } from './routes.ts'

// `nuxt generate` writes the pages it finds by following links, but a feed is no page: the crawler skips `.xml` links.
// So static files get the RSS feeds of the features (`server/middleware/<page key>-feed.ts`, rules in ./routes.ts)
// only when they are listed. A server build (`nuxt build`) answers the feeds at request time and is left as it is.
export default defineNuxtModule({
  meta: { name: 'feeds' },
  setup(_options, nuxt) {
    const pages = (nuxt.options as { ginko?: { pages?: Record<string, Record<string, string>> } }).ginko?.pages
    const dir = `${nuxt.options.rootDir}/server/middleware`
    if (!pages || !existsSync(dir)) return
    const routes = feedRoutes(readdirSync(dir), pages)
    if (!routes.length) return
    nuxt.hook('nitro:config', (nitro) => {
      if (!nitro.static) return
      nitro.prerender = { ...nitro.prerender, routes: [...(nitro.prerender?.routes ?? []), ...routes] }
    })
  },
})
