import { createError, defineEventHandler, getQuery } from 'nuxt/server'
import { posts } from '../utils/posts'

export default defineEventHandler((event) => {
  const { slug, locale } = getQuery(event) as { slug: string, locale: string }
  const post = posts.find(p => p.slugs[locale] === slug)
  if (!post) throw createError({ statusCode: 404, statusMessage: 'Post not found' })
  return { title: post.title[locale], slugs: post.slugs }
})
