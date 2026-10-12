// HTTP routes for the CLI's release (SPEC 5.1): `GET /release/state?site=<slug>` and `POST /release`.
// The push key `Authorization: Bearer ginko_<site>_<32>` names the site; only its SHA-256 is stored.
import type { HttpRouter } from 'convex/server'
import { internal } from '../_generated/api'
import { httpAction } from '../_generated/server'
import { hasDollarKey } from '../lib/input'
import { RELEASE_LIMITS } from '../release'
import { authenticate, errorResponse, failure, json } from './key'

function isRelease(body: unknown): body is {
  site?: string; commit: string; expectedSchemaRev: number; expectedContentRev: number; schema: object
  writes: { entry: string; fields: Record<string, unknown> }[]
} {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return false
  const b = body as Record<string, unknown>
  if (b.site !== undefined && typeof b.site !== 'string') return false
  if (typeof b.commit !== 'string' || !Number.isInteger(b.expectedSchemaRev) || !Number.isInteger(b.expectedContentRev)) return false
  if (typeof b.schema !== 'object' || b.schema === null || Array.isArray(b.schema)) return false
  if (!Array.isArray(b.writes)) return false
  return b.writes.every((w) => typeof w === 'object' && w !== null && typeof (w as { entry?: unknown }).entry === 'string'
    && typeof (w as { fields?: unknown }).fields === 'object' && (w as { fields?: unknown }).fields !== null
    && !Array.isArray((w as { fields?: unknown }).fields))
}

const state = httpAction(async (ctx, request) => {
  const key = await authenticate(ctx, request, ['release', 'check'])
  if (key instanceof Response) return key
  const slug = new URL(request.url).searchParams.get('site')
  if (!slug) return failure('INVALID', 'Der Parameter site fehlt.')
  if (slug !== key.siteSlug) return failure('FORBIDDEN', 'Dieser Schlüssel gehört zu einer anderen Seite.')
  try {
    return json(200, await ctx.runQuery(internal.release.state, { site: key.site }))
  } catch (error) {
    return errorResponse(error)
  }
})

const release = httpAction(async (ctx, request) => {
  const key = await authenticate(ctx, request, ['release'])
  if (key instanceof Response) return key
  const raw = await request.text()
  if (new TextEncoder().encode(raw).byteLength > RELEASE_LIMITS.argBytes) return failure('RELEASE_TOO_LARGE', 'Dieser Release ist zu groß.')
  let body: unknown
  try {
    body = JSON.parse(raw)
  } catch {
    return failure('INVALID', 'Der Körper ist kein gültiges JSON.')
  }
  if (!isRelease(body)) return failure('INVALID', 'Der Release hat nicht die erwartete Form.')
  // Convex reserves keys starting with `$`; the database layer would refuse them with an uncoded error.
  if (hasDollarKey(body)) return failure('INVALID', 'Namen, die mit $ beginnen, sind nicht erlaubt.')
  if (body.site !== undefined && body.site !== key.siteSlug) return failure('FORBIDDEN', 'Dieser Schlüssel gehört zu einer anderen Seite.')
  try {
    const { site: _site, ...args } = body
    return json(200, await ctx.runMutation(internal.release.release, { ...args, site: key.site, actor: `pushkey:${key.keyId}`, schema: args.schema, writes: args.writes }))
  } catch (error) {
    return errorResponse(error)
  }
})

export function register(http: HttpRouter) {
  http.route({ path: '/release/state', method: 'GET', handler: state })
  http.route({ path: '/release', method: 'POST', handler: release })
}
