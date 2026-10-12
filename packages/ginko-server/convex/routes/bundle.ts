// GET /bundle/<site>?format=3&locale=<l>[&minRev=<schemaRev>.<contentRev>] (SPEC 6).
// Order: format, rate limit (also finds the site), build. Every answer is JSON with code and
// German message on errors; the HTTP status carries the SPEC 6 mapping.
import { BUNDLE_FORMAT } from '@lupinum/ginko/internal'
import type { HttpRouter } from 'convex/server'
import { internal } from '../_generated/api'
import { SITE_TOKEN_HEADER } from '../bundle'
import { httpAction } from '../_generated/server'

const headers = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
  'access-control-allow-origin': '*',
}

function reply(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers })
}

function failure(status: number, code: string, message: string): Response {
  return reply(status, { code, message })
}

/** `<schemaRev>.<contentRev>`; a malformed value is ignored. */
function parseMinRev(value: string | null): { schemaRev: number; contentRev: number } | undefined {
  const match = value?.match(/^(\d+)\.(\d+)$/)
  if (!match) return undefined
  return { schemaRev: Number(match[1]), contentRev: Number(match[2]) }
}

const bundle = httpAction(async (ctx, request) => {
  try {
    const url = new URL(request.url)
    const slug = url.pathname.slice('/bundle/'.length)
    if (url.searchParams.get('format') !== String(BUNDLE_FORMAT)) {
      return failure(400, 'FORMAT_UNSUPPORTED', `Dieses Format gibt es nicht. Erwartet: format=${BUNDLE_FORMAT}.`)
    }

    const token = request.headers.get(SITE_TOKEN_HEADER) ?? undefined
    const admitted = await ctx.runMutation(internal.bundle.admit, { slug, token })
    if (admitted === 'SITE_NOT_FOUND') return failure(404, 'SITE_NOT_FOUND', 'Diese Seite gibt es nicht.')
    if (admitted === 'RATE_LIMITED') return failure(429, 'RATE_LIMITED', 'Zu viele Anfragen. Bitte warte eine Minute.')

    const result = await ctx.runQuery(internal.bundle.build, {
      slug,
      locale: url.searchParams.get('locale') ?? '',
      minRev: parseMinRev(url.searchParams.get('minRev')),
    })
    if (result === 'SITE_NOT_FOUND') return failure(404, 'SITE_NOT_FOUND', 'Diese Seite gibt es nicht.')
    if (result === 'STALE') return failure(409, 'STALE', 'Der Inhalt ist älter als verlangt. Bitte später erneut laden.')
    return reply(200, result)
  } catch {
    return failure(503, 'INTERNAL', 'Die Plattform ist gerade nicht erreichbar.')
  }
})

/** HTTP routes of this area. http.ts only composes. */
export function register(http: HttpRouter) {
  http.route({ pathPrefix: '/bundle/', method: 'GET', handler: bundle })
}
