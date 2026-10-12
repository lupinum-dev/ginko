import { defineEventHandler, getQuery } from 'nuxt/server'
import { posts } from '../utils/posts'

// Only the posts that exist in `locale`. The page passes the locale, as for /api/post: an internal call
// during server rendering has no URL prefix of its own.
export default defineEventHandler((event) => {
  const { locale } = getQuery(event) as { locale: string }
  return posts.filter(p => p.slugs[locale]).map(p => ({ slug: p.slugs[locale]!, title: p.title[locale]! }))
})
