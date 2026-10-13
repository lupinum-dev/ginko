// The feed of the main language: /blog/rss.xml. Registered by modules/pages.ts only when the site has `posts`.
import { serveBlogFeed } from '../lib/blogFeed'
export default defineEventHandler((event) => serveBlogFeed(event, (useRuntimeConfig(event).public.ginko as { mainLocale: string }).mainLocale))
