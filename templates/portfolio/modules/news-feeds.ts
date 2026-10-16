// Synced from templates/_features/blog/modules/news-feeds.ts by `pnpm templates sync`. Edit the source, not this copy.
import { defineNuxtModule } from 'nuxt/kit'

// `nuxt generate` writes the pages its crawler finds through links, and it skips the news feeds
// (<news page>/rss.xml, server/middleware/news-feed.ts): they end in .xml. This lists the feed of every language for
// prerendering, so a static site has its feeds too. A server build (`nuxt build`) is left alone: there the middleware
// answers each request with the posts of that moment.
export default defineNuxtModule({
  meta: { name: 'news-feeds' },
  setup(_options, nuxt) {
    const news = (nuxt.options as { ginko?: { pages?: { news?: Record<string, string> } } }).ginko?.pages?.news
    if (!news) return
    nuxt.hook('nitro:config', (nitro) => {
      if (!nitro.static) return
      const feeds = Object.values(news).map((page) => `${page === '/' ? '' : page}/rss.xml`)
      nitro.prerender = { ...nitro.prerender, routes: [...(nitro.prerender?.routes ?? []), ...feeds] }
    })
  },
})
