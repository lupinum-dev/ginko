import { defineNuxtModule } from 'nuxt/kit'

// `nuxt generate` writes the pages it finds through links, but it does not follow a link to a file address such as
// the feed's, so the feed of each language (`<news page>/rss.xml`, server/middleware/news-feed.ts) is named here.
// A server build answers the feed on request and needs nothing.
export default defineNuxtModule({
  meta: { name: 'blog-feed' },
  setup(_options, nuxt) {
    const news = (nuxt.options as { ginko?: { pages?: Record<string, Record<string, string | undefined>> } }).ginko?.pages?.news
    if (!news || !nuxt.options.nitro.static) return
    const prerender = (nuxt.options.nitro.prerender ??= {})
    const feeds = Object.values(news).flatMap((path) => (path ? [`${path === '/' ? '' : path}/rss.xml`] : []))
    prerender.routes = [...(prerender.routes ?? []), ...feeds]
  },
})
