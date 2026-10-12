// The blog feed of one language, read from the build-time file bundle (what /__ginko/files/<locale>.json serves).
// Only file blogs have a feed: posts that live on the platform are not in that bundle.
import schema from '#ginko/schema'
import fileBundles from '#ginko/files'
import type { Brick } from '@lupinum/ginko'
import { isVisible, todayIn } from '@lupinum/ginko/internal'
import type { H3Event } from 'h3'
import { rssXml } from './rss'

export function serveBlogFeed(event: H3Event, locale: string) {
  const config = useRuntimeConfig(event).public.ginko as { name: string; url: string; locales: string[]; timezone: string; seo: { description?: string } }
  const bundle = config.locales.includes(locale) ? fileBundles[locale as keyof typeof fileBundles] : undefined
  const posts = bundle?.bricks.posts
  const def = schema.bricks.posts as Brick | undefined
  if (!bundle || posts?.kind !== 'collection' || def?.kind !== 'collection') throw createError({ statusCode: 404, statusMessage: 'No blog' })

  const base = config.url.replace(/\/$/, '')
  const authors = bundle.bricks.authors?.kind === 'collection' ? bundle.bricks.authors.items : []
  const today = todayIn(config.timezone)
  const route = def.route?.[locale as keyof typeof def.route]
  if (!route) throw createError({ statusCode: 404, statusMessage: 'No blog' })
  const items = posts.items.filter((p) => p.urls?.[bundle.locale] && isVisible(def, p.data, today)).map((p) => ({
    title: String(p.data.title),
    link: base + p.urls![bundle.locale],
    description: typeof p.data.description === 'string' ? p.data.description : undefined,
    date: String(p.data.date),
    authors: ((p.data.authors as string[] | undefined) ?? []).flatMap((id) => authors.find((a) => a.id === id)?.data.name ?? []).map(String),
  }))
  const page = base + route.replace('/[slug]', '')
  setResponseHeader(event, 'content-type', 'application/rss+xml; charset=utf-8')
  return rssXml({ title: `${config.name} Blog`, link: page, self: `${page}/rss.xml`, description: config.seo.description ?? `${config.name} Blog`, language: locale, items })
}
