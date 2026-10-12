// `/robots.txt` (SPEC 8 "SEO"): allows crawling on the site's own host only; any other host
// (preview deployment, staging, localhost) is disallowed entirely.
import { defineEventHandler, getRequestHost, useRuntimeConfig } from 'nuxt/server'
import { isPreviewHost, robotsTxt } from '../../../internal.ts'
import type { GinkoPublicConfig } from '../shared.ts'

export default defineEventHandler((event) => {
  const { url } = useRuntimeConfig().public.ginko as GinkoPublicConfig
  event.res.headers.set('content-type', 'text/plain; charset=utf-8')
  // A static build (nuxt generate) has no request host: its output is meant for the site's own host.
  const noindex = !import.meta.prerender && isPreviewHost(getRequestHost(event), url)
  return robotsTxt({ noindex, sitemap: new URL('/sitemap.xml', url).href })
})
