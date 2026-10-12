// Framing rules (SPEC 8 "Header"): only the platform may frame the preview; nothing frames pages.
import { defineEventHandler, getRequestHost, getRequestURL, useRuntimeConfig } from 'nuxt/server'
import { isPreviewHost } from '../../../index.ts'
import type { GinkoPublicConfig } from '../shared.ts'

export default defineEventHandler((event) => {
  const { platform, url } = useRuntimeConfig().public.ginko as GinkoPublicConfig
  const preview = /^\/__ginko(\/|$)/.test(getRequestURL(event).pathname)
  const origin = platform ? new URL(platform).origin : ''
  event.res.headers.set('content-security-policy', preview && origin ? `frame-ancestors ${origin}` : `frame-ancestors 'self'`)
  // Only the site's own host is indexable (SPEC 8 "SEO"); previews and staging never are.
  if (isPreviewHost(getRequestHost(event), url)) event.res.headers.set('x-robots-tag', 'noindex')
})
