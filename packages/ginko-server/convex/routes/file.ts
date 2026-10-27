// GET /file/<site-slug>/<uploadId>/<storageId>: the stable address of a site's file. The site's own server
// (`/__ginko/file/…`) asks here and gets a redirect to the current storage URL, so pages never hold storage hosts.
// The bytes of a storage id never change, but its storage address may (a new backend or host), so the redirect is
// cached for an hour only; the site caches the bytes. The check makes sure the route only serves files that a ready
// upload of that site owns.
import type { HttpRouter } from 'convex/server'
import { internal } from '../_generated/api'
import { httpAction } from '../_generated/server'

function notFound(): Response {
  return new Response(JSON.stringify({ code: 'FILE_NOT_FOUND', message: 'This file does not exist.' }), {
    status: 404,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'access-control-allow-origin': '*' },
  })
}

const file = httpAction(async (ctx, request) => {
  try {
    const [slug = '', upload = '', storage = ''] = new URL(request.url).pathname.slice('/file/'.length).split('/')
    const target = await ctx.runQuery(internal.bundle.fileUrl, { slug: decodeURIComponent(slug), upload, storage })
    if (!target) return notFound()
    return new Response(null, { status: 302, headers: { location: target, 'cache-control': 'public, max-age=3600', 'access-control-allow-origin': '*' } })
  } catch {
    return new Response(JSON.stringify({ code: 'INTERNAL', message: 'The platform cannot be reached right now.' }), {
      status: 503,
      headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
    })
  }
})

/** HTTP routes of this area. http.ts only composes. */
export function register(http: HttpRouter) {
  http.route({ pathPrefix: '/file/', method: 'GET', handler: file })
}
