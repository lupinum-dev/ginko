/// <reference path="../schema.d.ts" />
// `/__ginko/file/<upload>/<storage>`: a file of the platform on the site's own address. The page holds this path, never a
// storage host, so a backend or hostname change cannot break images in caches and search engines. The platform's
// `/file/<site>/…` checks that the storage id belongs to a ready upload of this site and redirects to the storage; this
// route follows that redirect and streams the bytes back.
import { createError, defineEventHandler, getRouterParam, useRuntimeConfig } from 'nuxt/server'
import { FILE_ID, TIMEOUT_MS, SITE_TOKEN_HEADER } from '../platform-request.ts'
import type { GinkoPublicConfig } from '../shared.ts'

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig().public.ginko as GinkoPublicConfig
  const upload = getRouterParam(event, 'upload') ?? ''
  const storage = getRouterParam(event, 'storage') ?? ''
  // The id shapes are checked before anything is fetched, so no other address can be made up.
  if (!config.platform || !FILE_ID.test(upload) || !FILE_ID.test(storage)) throw createError({ statusCode: 404, statusMessage: 'File not found' })
  const headers: Record<string, string> = {}
  const siteToken = useRuntimeConfig().ginkoRevalidateToken as string | undefined
  if (siteToken) headers[SITE_TOKEN_HEADER] = siteToken
  const url = `${config.platform.replace(/\/$/, '')}/file/${encodeURIComponent(config.site)}/${upload}/${storage}`
  let upstream: Response
  try {
    upstream = await fetch(url, { headers, redirect: 'follow', signal: AbortSignal.timeout(TIMEOUT_MS) })
  } catch {
    event.res.headers.set('cache-control', 'no-store')
    throw createError({ statusCode: 502, statusMessage: 'File temporarily unavailable' })
  }
  if (upstream.status === 404) throw createError({ statusCode: 404, statusMessage: 'File not found' })
  const type = upstream.headers.get('content-type')
  // Uploads are images and PDFs, so an HTML page is never the file: it is a platform without this route (a sign-in
  // page it redirected to), and caching it for a year would put that page in place of the image.
  if (!upstream.ok || !upstream.body || type?.toLowerCase().startsWith('text/html')) {
    event.res.headers.set('cache-control', 'no-store')
    throw createError({ statusCode: 502, statusMessage: 'File temporarily unavailable' })
  }
  const length = upstream.headers.get('content-length')
  if (type) event.res.headers.set('content-type', type)
  if (length) event.res.headers.set('content-length', length)
  event.res.headers.set('cache-control', 'public, max-age=31536000, s-maxage=31536000, immutable')
  return upstream.body
})
