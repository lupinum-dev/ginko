// "Sofort von der Seite nehmen" (SPEC 4.4): asks the site to re-render every page that a
// change may have made stale, and checks each answer against the revision it must show.
import { routeUrls, type Schema } from '@lupinum/ginko/internal'
import { v, type Infer } from 'convex/values'
import { internal } from './_generated/api'
import { action, internalMutation, internalQuery } from './_generated/server'
import { actorFor, fail, recordOp, replayed } from './lib/access'
import { isFetchableSiteUrl } from './lib/siteUrl'

export const MAX_PATHS = 500
export const BATCH = 20
export const RETRY_MS = 5_000
export const RETRIES = 3

type Rev = { schemaRev: number; contentRev: number }

interface Plan {
  hash: string
  url: string
  token: string
  min: Rev
  paths: string[]
  /** More than MAX_PATHS addresses: only the pages and the sitemap were sent. The Studio says so in the owner's language. */
  limited: boolean
}

const rowValidator = v.object({ path: v.string(), status: v.number(), rev: v.union(v.string(), v.null()), ok: v.boolean() })
type Row = Infer<typeof rowValidator>
/** What a refresh answers: one row per path, and whether only the pages and the sitemap were sent. */
const refreshResult = v.object({ results: v.array(rowValidator), limited: v.boolean() })
type RefreshResult = Infer<typeof refreshResult>

/** Relative, plain paths without duplicates; anything else is dropped. */
function clean(paths: Iterable<string>): string[] {
  return [...new Set([...paths].map(normalize).filter((p): p is string => p !== null))]
}

/** Only relative, plain paths go to the site. */
function normalize(path: string): string | null {
  const p = path.trim()
  if (!p.startsWith('/') || p.startsWith('//') || /[\\?#]/.test(p) || p.split('/').includes('..')) return null
  return p
}

/** Who may refresh, which paths, and the proof each answer must carry (SPEC 4.4 steps 1–2). */
export const plan = internalQuery({
  args: { site: v.string(), opId: v.string() },
  handler: async (ctx, args): Promise<{ replay: RefreshResult } | ({ replay?: undefined } & Plan)> => {
    const actor = await actorFor(ctx, args.site)
    if (actor.role === 'staff') fail('FORBIDDEN', 'errors.ownersAndAdminsOnly')
    const { hash, result } = await replayed(ctx, actor, args.opId, args)
    // The stored result of this op is the one `record` stored.
    if (result !== undefined) return { replay: result as RefreshResult }

    const token = actor.site.refreshToken
    if (!token) fail('INVALID', 'errors.reloadKeyMissing')
    // The token goes to this address, so it must be a public one (SSRF); stored URLs are checked again here, not only when saved.
    if (!isFetchableSiteUrl(actor.site.url, process.env.GINKO_LOCAL === '1')) fail('INVALID', 'errors.siteUrlNotAllowed')

    const schema = actor.site.schema as Schema
    const pages = new Set<string>(['/sitemap.xml'])
    for (const paths of Object.values(schema.pages)) for (const page of Object.values(paths)) if (page) pages.add(page)

    // Every routed entry, deleted ones too: a page that a change hid, or a deletion removed, must be re-rendered.
    const routed = new Set<string>()
    for (const [key, brick] of Object.entries(schema.bricks)) {
      if (brick.kind !== 'collection' || !brick.route) continue
      const rows = await ctx.db.query('entries').withIndex('by_site_brick_order', (q) => q.eq('site', actor.site._id).eq('brick', key)).collect()
      // Every locale's address, also where the entry is untranslated today: a removed translation must purge its page.
      for (const row of rows) {
        const urls = routeUrls(schema, brick, { id: row._id, order: row.order, data: row.data, prints: row.prints })
        for (const url of Object.values(urls)) if (url) routed.add(url)
      }
    }

    const all = clean([...pages, ...routed])
    const limited = all.length > MAX_PATHS
    return {
      hash,
      url: actor.site.url,
      token,
      min: { schemaRev: actor.site.schemaRev, contentRev: actor.site.contentRev },
      paths: limited ? clean(pages) : all,
      limited,
    }
  },
})

/**
 * Stores the outcome under the opId, so a retry after a lost answer gets the same one. Two
 * concurrent refreshes can both pass `plan`; the first recording wins and both get its result.
 */
export const record = internalMutation({
  args: { site: v.string(), opId: v.string(), hash: v.string(), result: refreshResult },
  handler: async (ctx, args): Promise<RefreshResult> => {
    const actor = await actorFor(ctx, args.site)
    const row = await ctx.db.query('ops').withIndex('by_site_actor_op', (q) => q.eq('site', actor.site._id).eq('actor', actor.user.id).eq('opId', args.opId)).unique()
    if (row) {
      if (row.hash !== args.hash) fail('OP_REUSED', 'errors.actionReusedWithOtherContent')
      return row.result
    }
    await recordOp(ctx, actor, args.opId, args.hash, args.result)
    // Only a refresh that every page confirmed counts as "last update"; a partly failed one leaves the time as it was.
    const rows = args.result.results
    if (rows.length > 0 && rows.every((r) => r.ok)) await ctx.db.patch(actor.site._id, { lastRefreshAt: Date.now() })
    return args.result
  },
})

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms))
}

/** True when the answer proves that the page shows at least the minimum revision. */
function proves(rev: string | null, min: Rev): boolean {
  const match = rev?.match(/^(\d+)\.(\d+)$/)
  if (!match) return false
  return Number(match[1]) >= min.schemaRev && Number(match[2]) >= min.contentRev
}

async function requestOnce(p: Plan, path: string): Promise<Row> {
  const minRev = `${p.min.schemaRev}.${p.min.contentRev}`
  try {
    const response = await fetch(`${p.url.replace(/\/+$/, '')}${path}`, {
      headers: { 'x-prerender-revalidate': p.token, 'x-ginko-min-rev': minRev },
      redirect: 'manual',
    })
    await response.body?.cancel()
    const rev = response.headers.get('x-ginko-rev')
    // 503 keeps the old page on the site, so it is retried like a missing proof.
    return { path, status: response.status, rev, ok: response.status !== 503 && proves(rev, p.min) }
  } catch {
    // A network error is treated like a 503: the site may answer on the next try.
    return { path, status: 0, rev: null, ok: false }
  }
}

async function refreshPath(p: Plan, path: string): Promise<Row> {
  let row: Row = { path, status: 0, rev: null, ok: false }
  for (let attempt = 0; attempt <= RETRIES; attempt++) {
    if (attempt > 0) await sleep(RETRY_MS)
    row = await requestOnce(p, path)
    if (row.ok) break
  }
  return row
}

/** Sends the paths in batches of 20. Results keep the order of the paths. */
export const urgentRefresh = action({
  args: { site: v.string(), opId: v.string() },
  // Typed by hand: the action calls this module's own functions, so TypeScript cannot infer its result.
  handler: async (ctx, args): Promise<RefreshResult> => {
    const p = await ctx.runQuery(internal.refresh.plan, args)
    if (p.replay !== undefined) return p.replay
    const plan: Plan = p
    const results: Row[] = []
    for (let i = 0; i < plan.paths.length; i += BATCH) {
      results.push(...(await Promise.all(plan.paths.slice(i, i + BATCH).map((path) => refreshPath(plan, path)))))
    }
    const result = { results, limited: plan.limited }
    return ctx.runMutation(internal.refresh.record, { site: args.site, opId: args.opId, hash: plan.hash, result })
  },
})
