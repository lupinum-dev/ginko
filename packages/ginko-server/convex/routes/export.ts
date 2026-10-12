// HTTP route for `ginko export` and `ginko pull` (SPEC 9, 12): `GET /export?site=<slug>`.
// Same push key, site check and error answers as GET /release/state; the key needs scope export or pull.
import type { HttpRouter } from 'convex/server'
import { internal } from '../_generated/api'
import { httpAction } from '../_generated/server'
import { authenticate, errorResponse, failure, json } from './key'

const exportSite = httpAction(async (ctx, request) => {
  const key = await authenticate(ctx, request, ['export', 'pull'])
  if (key instanceof Response) return key
  const slug = new URL(request.url).searchParams.get('site')
  if (!slug) return failure('INVALID', 'The parameter site is missing.')
  if (slug !== key.siteSlug) return failure('FORBIDDEN', 'This key belongs to another site.')
  try {
    return json(200, await ctx.runQuery(internal.backup.snapshot, { site: key.site }))
  } catch (error) {
    return errorResponse(error, 'The export failed. Please try again later.')
  }
})

export function register(http: HttpRouter) {
  http.route({ path: '/export', method: 'GET', handler: exportSite })
}
