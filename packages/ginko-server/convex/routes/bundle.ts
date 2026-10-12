// GET /bundle/<site>?format=3&locale=<l>[&minRev=<schemaRev>.<contentRev>] (SPEC 6).
// Order: format, rate limit (also finds the site), build. Every answer is JSON with code and
// an English message on errors (a site's server reads them); the HTTP status carries the SPEC 6 mapping.
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
      return failure(400, 'FORMAT_UNSUPPORTED', `This format does not exist. Expected: format=${BUNDLE_FORMAT}.`)
    }

    const token = request.headers.get(SITE_TOKEN_HEADER) ?? undefined
    const admitted = await ctx.runMutation(internal.bundle.admit, { slug, token })
    if (admitted === 'SITE_NOT_FOUND') return failure(404, 'SITE_NOT_FOUND', 'This site does not exist.')
    if (admitted === 'RATE_LIMITED') return failure(429, 'RATE_LIMITED', 'Too many requests. Please wait a minute.')

    const result = await ctx.runQuery(internal.bundle.build, {
      slug,
      locale: url.searchParams.get('locale') ?? '',
      minRev: parseMinRev(url.searchParams.get('minRev')),
    })
    if (result === 'SITE_NOT_FOUND') return failure(404, 'SITE_NOT_FOUND', 'This site does not exist.')
    if (result === 'STALE') return failure(409, 'STALE', 'The content is older than requested. Please load it again later.')
    return reply(200, result)
  } catch {
    return failure(503, 'INTERNAL', 'The platform cannot be reached right now.')
  }
})

/** HTTP routes of this area. http.ts only composes. */
export function register(http: HttpRouter) {
  http.route({ pathPrefix: '/bundle/', method: 'GET', handler: bundle })
}
