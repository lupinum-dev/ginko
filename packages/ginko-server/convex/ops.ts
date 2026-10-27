// Operator tools (internal; run with `convex run ops:<name>`): what state the uploads are in, so a stuck or
// failed upload can be found and repaired (`uploads:retry`) without reading Convex's tables by hand.
import { v } from 'convex/values'
import type { Doc } from './_generated/dataModel'
import { internalQuery, type QueryCtx } from './_generated/server'
import { isStale } from './uploads'

const LIST_MAX = 50

async function describe(ctx: QueryCtx, row: Doc<'uploads'>, slugs: Map<string, string>, now: number) {
  if (!slugs.has(row.site)) slugs.set(row.site, (await ctx.db.get(row.site))?.slug ?? '(deleted site)')
  const referenced = (await ctx.db.query('fileRefs').withIndex('by_file', (q) => q.eq('file', row._id)).first()) !== null
  return {
    id: row._id, site: slugs.get(row.site)!, name: row.name, attempts: row.attempts, error: row.error ?? null,
    ageMinutes: Math.round((now - row._creationTime) / 60_000), referenced,
  }
}

/**
 * Upload counts per status and, for the rows that need a look, up to 50 stuck `processing` uploads (uploads.isStale)
 * and up to 50 `failed` ones (oldest first). `site` is a slug; leave it out for every site. Ready uploads are counted
 * for one site only: across the platform they are too many for one query.
 * Open migrations are not listed: `migrations.ts` records no runs (see internals/migrations.md).
 */
export const status = internalQuery({
  args: { site: v.optional(v.string()) },
  handler: async (ctx, { site }) => {
    const now = Date.now()
    const siteRow = site === undefined ? null : await ctx.db.query('sites').withIndex('by_slug', (q) => q.eq('slug', site)).unique()
    if (site !== undefined && !siteRow) return null
    // One site: all its uploads in one read. Every site: only the processing and failed ones.
    const rows = siteRow
      ? await ctx.db.query('uploads').withIndex('by_site', (q) => q.eq('site', siteRow._id)).collect()
      : [
          ...await ctx.db.query('uploads').withIndex('by_status', (q) => q.eq('status', 'processing')).collect(),
          ...await ctx.db.query('uploads').withIndex('by_status', (q) => q.eq('status', 'failed')).collect(),
        ]
    const counts: { processing: number; failed: number; ready?: number } = siteRow ? { processing: 0, failed: 0, ready: 0 } : { processing: 0, failed: 0 }
    for (const row of rows) if (counts[row.status] !== undefined) counts[row.status]!++
    const slugs = new Map<string, string>()
    const stuck = []
    for (const row of rows.filter((r) => isStale(r, now)).slice(0, LIST_MAX)) stuck.push(await describe(ctx, row, slugs, now))
    const failed = []
    for (const row of rows.filter((r) => r.status === 'failed').slice(0, LIST_MAX)) failed.push(await describe(ctx, row, slugs, now))
    return { counts, stuck, failed }
  },
})
