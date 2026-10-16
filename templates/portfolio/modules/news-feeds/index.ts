// Synced from templates/_features/blog/modules/news-feeds/index.ts by `pnpm templates sync`. Edit the source, not this copy.
import { defineNuxtModule } from 'nuxt/kit'
import { feedRoutes } from './routes.ts'

// `nuxt generate` writes the pages its crawler finds through links, and it skips the news feeds
// (<news page>/rss.xml, server/middleware/news-feed.ts): they end in .xml. This lists the feed of every language for
// prerendering (./routes.ts), so a static site has its feeds too. A server build (`nuxt build`) is left alone: there
// the middleware answers each request with the posts of that moment.
export default defineNuxtModule({
  meta: { name: 'news-feeds' },
  setup(_options, nuxt) {
    const news = (nuxt.options as { ginko?: { pages?: { news?: Record<string, string> } } }).ginko?.pages?.news
    nuxt.hook('nitro:config', (nitro) => {
      const feeds = feedRoutes(news, !!nitro.static)
      if (!feeds.length) return
      nitro.prerender = { ...nitro.prerender, routes: [...(nitro.prerender?.routes ?? []), ...feeds] }
    })
  },
})
