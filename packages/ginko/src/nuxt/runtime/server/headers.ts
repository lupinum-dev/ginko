// Response headers (SPEC 8 "Header"): framing, nosniff, referrer policy; the values come from `siteHeaders`.
import { defineEventHandler, getRequestHost, getRequestURL, useRuntimeConfig } from 'nuxt/server'
import { isPreviewHost, siteHeaders } from '../../../internal.ts'
import type { GinkoPublicConfig } from '../shared.ts'

export default defineEventHandler((event) => {
  const { platform, url, noindex } = useRuntimeConfig().public.ginko as GinkoPublicConfig
  const preview = /^\/__ginko(\/|$)/.test(getRequestURL(event).pathname)
  const origin = platform ? new URL(platform).origin : ''
  // Only the site's own host is indexable (SPEC 8 "SEO"); previews, staging and a deployment with `noindex` never are.
  const headers = siteHeaders({ preview, platformOrigin: origin, noindex: noindex || isPreviewHost(getRequestHost(event), url) })
  for (const [name, value] of Object.entries(headers)) event.res.headers.set(name, value)
})
