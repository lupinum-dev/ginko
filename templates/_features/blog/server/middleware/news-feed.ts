import { rssXml } from '@lupinum/ginko/basics'
import { defineEventHandler, getRequestURL, useRuntimeConfig } from 'nuxt/server'
import site from '../../ginko.config'

// The news feed of each language (RSS 2.0) at <news page>/rss.xml: /news/rss.xml, /de/aktuelles/rss.xml. Title,
// summary, date and authors of the visible posts; the feed links to the page for the full text. Drafts are never in it.
export default defineEventHandler(async (event) => {
  const path = getRequestURL(event).pathname
  if (!path.endsWith('/rss.xml')) return
  const page = path.slice(0, -'/rss.xml'.length) || '/'
  // Only the news page's address comes from ginko.config.ts; name, address and languages come from the runtime config,
  // like the pages' canonical links, so the feed and the pages always name the same site address.
  const ginko = useRuntimeConfig().public.ginko
  const news: Partial<Record<string, string>> = site.pages.news
  const locale = ginko.locales.find((code) => news[code] === page)
  if (!locale) return
  const [posts, people] = await Promise.all([getGinkoItems(event, 'posts', locale), getGinkoItems(event, 'people', locale)])
  const names = new Map(people.map((person) => [person.id, String(person.data.name)]))
  const origin = ginko.url.replace(/\/$/, '')
  const { t, language } = getI18n({ context: { locale } }, 'blog')
  event.res.headers.set('content-type', 'application/rss+xml; charset=utf-8')
  return rssXml({
    title: `${ginko.name}: ${t('title')}`,
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
