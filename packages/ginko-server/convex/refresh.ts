// "Sofort von der Seite nehmen" (SPEC 4.4): asks the site to re-render every page that a
// change may have made stale, and checks each answer against the revision it must show.
import { urlsFor, type Json, type Schema } from '@lupinum/ginko'
import { v } from 'convex/values'
import { internal } from './_generated/api'
import { action, internalMutation, internalQuery } from './_generated/server'
import { actorFor, fail, recordOp, replayed } from './lib/access'

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
  note: string | null
}

type Row = { path: string; status: number; rev: string | null; ok: boolean }

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
  handler: async (ctx, args): Promise<{ replay: Json } | ({ replay?: undefined } & Plan)> => {
    const actor = await actorFor(ctx, args.site)
    if (actor.role === 'staff') fail('FORBIDDEN', 'errors.ownersAndAdminsOnly')
    const { hash, result } = await replayed(ctx, actor, args.opId, args)
    if (result !== undefined) return { replay: result }

    const token = actor.site.refreshToken
    if (!token) fail('INVALID', 'errors.reloadKeyMissing')

    const schema = actor.site.schema as Schema
    const pages = new Set<string>(['/sitemap.xml'])
    for (const paths of Object.values(schema.pages)) for (const page of Object.values(paths)) if (page) pages.add(page)

    // Every routed entry, deleted ones too: a page that a change hid, or a deletion removed, must be re-rendered.
    const routed = new Set<string>()
    for (const [key, brick] of Object.entries(schema.bricks)) {
      if (brick.kind !== 'collection' || !brick.route) continue
      const rows = await ctx.db.query('entries').withIndex('by_site_brick_order', (q) => q.eq('site', actor.site._id).eq('brick', key)).collect()
      // `missing: 'fallback'` keeps every locale in the URL map, including locales that are hidden today.
      const everywhere = { ...brick, missing: 'fallback' as const }
      for (const row of rows) {
        const urls = urlsFor(schema, key, everywhere, { id: row._id, order: row.order, data: row.data, prints: row.prints }, () => undefined)
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
      note: limited ? `Mehr als ${MAX_PATHS} Adressen: Es wurden nur die Seiten und die Sitemap neu geladen.` : null,
    }
  },
})

/**
 * Stores the outcome under the opId, so a retry after a lost answer gets the same one. Two
 * concurrent refreshes can both pass `plan`; the first recording wins and both get its result.
 */
export const record = internalMutation({
  args: { site: v.string(), opId: v.string(), hash: v.string(), result: v.any() },
  handler: async (ctx, args): Promise<Json> => {
    const actor = await actorFor(ctx, args.site)
    const row = await ctx.db.query('ops').withIndex('by_site_actor_op', (q) => q.eq('site', actor.site._id).eq('actor', actor.user.id).eq('opId', args.opId)).unique()
    if (row) {
      if (row.hash !== args.hash) fail('OP_REUSED', 'errors.actionReusedWithOtherContent')
      return row.result as Json
    }
    await recordOp(ctx, actor, args.opId, args.hash, args.result as Json)
    // Only a refresh that every page confirmed counts as "last update"; a partly failed one leaves the time as it was.
    const rows = (args.result as { results?: { ok?: boolean }[] }).results
    if (Array.isArray(rows) && rows.length > 0 && rows.every((r) => r.ok === true)) await ctx.db.patch(actor.site._id, { lastRefreshAt: Date.now() })
    return args.result as Json
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
  handler: async (ctx, args): Promise<Json> => {
    const p = await ctx.runQuery(internal.refresh.plan, args)
    if (p.replay !== undefined) return p.replay
    const plan: Plan = p
    const results: Row[] = []
    for (let i = 0; i < plan.paths.length; i += BATCH) {
      results.push(...(await Promise.all(plan.paths.slice(i, i + BATCH).map((path) => refreshPath(plan, path)))))
    }
    const result: Json = { results, note: plan.note }
    return ctx.runMutation(internal.refresh.record, { site: args.site, opId: args.opId, hash: plan.hash, result })
  },
})
