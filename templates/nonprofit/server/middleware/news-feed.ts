// Synced from templates/_features/blog/server/middleware/news-feed.ts by `pnpm templates sync`. Edit the source, not this copy.
import { rssXml } from '@lupinum/ginko/basics'
import { defineEventHandler, getRequestURL } from 'nuxt/server'
import site from '~~/ginko.config'

// The news feed of each language (RSS 2.0) at <news page>/rss.xml: /news/rss.xml, /de/aktuelles/rss.xml. Title,
// summary, date and authors of the visible posts; the feed links to the page for the full text. Drafts are never in it.
export default defineEventHandler(async (event) => {
  const path = getRequestURL(event).pathname
  if (!path.endsWith('/rss.xml')) return
  const page = path.slice(0, -'/rss.xml'.length) || '/'
  const news: Partial<Record<string, string>> = site.pages.news
  const locale = site.locales.find((code) => news[code] === page)
  if (!locale) return
  const [posts, people] = await Promise.all([getGinkoItems(event, 'posts', locale), getGinkoItems(event, 'people', locale)])
  const names = new Map(people.map((person) => [person.id, String(person.data.name)]))
  // The site's public address (ginko.config.ts `url`), like the canonical links of the pages.
  const origin = site.url.replace(/\/$/, '')
  const { t, language } = getI18n({ context: { locale } }, 'blog')
  event.res.headers.set('content-type', 'application/rss+xml; charset=utf-8')
  return rssXml({
    title: `${site.name}: ${t('title')}`,
    link: `${origin}${page}`,
    self: `${origin}${path}`,
    description: t('lead'),
    language,
    items: posts.filter((post) => post.url).map((post) => ({
      title: String(post.data.title),
      link: `${origin}${post.url}`,
      description: typeof post.data.description === 'string' ? post.data.description : undefined,
      date: String(post.data.date),
      authors: ((post.data.authors as string[] | undefined) ?? []).flatMap((id) => names.get(id) ?? []),
    })),
  })
})
