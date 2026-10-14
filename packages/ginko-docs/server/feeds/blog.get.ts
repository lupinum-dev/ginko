// The feed of the main language: /blog/rss.xml. Registered by modules/pages.ts only when the site has `posts`.
import { defineEventHandler, useRuntimeConfig } from 'nuxt/server'
import { serveBlogFeed } from '../lib/blogFeed'
export default defineEventHandler((event) => serveBlogFeed(event, (useRuntimeConfig().public.ginko as { mainLocale: string }).mainLocale))
