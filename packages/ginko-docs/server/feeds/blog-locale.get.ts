// The feed of another language: /<locale>/blog/rss.xml. The main language has none here (404), its feed has no prefix.
// Registered by modules/pages.ts only when the site has `posts`.
import { createError, defineEventHandler, getRouterParam, useRuntimeConfig } from 'nuxt/server'
import { serveBlogFeed } from '../lib/blogFeed'
export default defineEventHandler((event) => {
  const locale = getRouterParam(event, 'locale') ?? ''
  if (locale === (useRuntimeConfig().public.ginko as { mainLocale: string }).mainLocale) throw createError({ statusCode: 404, statusMessage: 'Not found' })
  return serveBlogFeed(event, locale)
})
