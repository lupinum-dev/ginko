// Synced from templates/_features/changelog/modules/changelog-feed.ts by `pnpm templates sync`. Edit the source, not this copy.
import { defineNuxtModule } from 'nuxt/kit'

// `nuxt generate` writes the pages it finds by following links, but a feed is no page: the crawler skips `.xml` links.
// So static files get the changelog feed of each language (<changelog page>/rss.xml, server/middleware/changelog-feed.ts)
// only when it is listed. A server build (`nuxt build`) answers the feed at request time and is left as it is.
export default defineNuxtModule({
  meta: { name: 'changelog-feed' },
  setup(_options, nuxt) {
    const changelog = (nuxt.options as { ginko?: { pages?: Record<string, Record<string, string>> } }).ginko?.pages?.changelog
    if (!changelog) return
    nuxt.hook('nitro:config', (nitro) => {
      if (!nitro.static) return
      nitro.prerender = { ...nitro.prerender, routes: [...(nitro.prerender?.routes ?? []), ...Object.values(changelog).map((path) => `${path}/rss.xml`)] }
    })
  },
})
