import { defineNuxtModule } from 'nuxt/kit'

// `nuxt generate` writes the pages it finds by following links, but a feed is no page: the crawler skips `.xml` links.
// So static files get the news feed of each language (<news page>/rss.xml, server/middleware/news-feed.ts) only
// when it is listed. A server build (`nuxt build`) answers the feed at request time and is left as it is.
export default defineNuxtModule({
  meta: { name: 'news-feed' },
  setup(_options, nuxt) {
    const news = (nuxt.options as { ginko?: { pages?: Record<string, Record<string, string>> } }).ginko?.pages?.news
    if (!news) return
    nuxt.hook('nitro:config', (nitro) => {
      if (!nitro.static) return
      nitro.prerender = { ...nitro.prerender, routes: [...(nitro.prerender?.routes ?? []), ...Object.values(news).map((path) => `${path}/rss.xml`)] }
    })
  },
})
