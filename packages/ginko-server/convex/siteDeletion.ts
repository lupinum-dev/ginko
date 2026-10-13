// The hard delete of a site (GDPR). `sites.startDeletion` schedules `purge` for 7 days later; it removes every row that
// names the site, the stored files and image variants behind its uploads, and last the site row itself.
// One run handles a bounded batch per table and schedules itself again until nothing is left.
import { v } from 'convex/values'
import { internal } from './_generated/api'
import type { Doc, Id, TableNames } from './_generated/dataModel'
import { internalMutation } from './_generated/server'
import { purgeUpload } from './lib/library'

/** Rows per table and run. Entries, changes and proposals carry big documents, so fewer of them fit in one transaction. */
const BATCH = 100
const HEAVY_BATCH = 20

export const purge = internalMutation({
  args: { site: v.id('sites') },
  handler: async (ctx, args): Promise<null> => {
    const site = await ctx.db.get(args.site)
    // Cancelled (or an old job after a cancel and a new start): nothing to do.
    if (!site?.deleting || site.deleting.at > Date.now()) return null
    const id = args.site
    let more = false
    const sweep = async <T extends { _id: Id<TableNames> }>(cap: number, find: (n: number) => Promise<T[]>, remove?: (row: T) => Promise<void>) => {
      const rows = await find(cap)
      for (const row of rows) await (remove ? remove(row) : ctx.db.delete(row._id))
      if (rows.length === cap) more = true
    }

    await sweep(BATCH, (n) => ctx.db.query('uploads').withIndex('by_site', (q) => q.eq('site', id)).take(n), (row: Doc<'uploads'>) => purgeUpload(ctx, row))
    await sweep(BATCH, (n) => ctx.db.query('fileRefs').withIndex('by_site_holder', (q) => q.eq('site', id)).take(n))
    await sweep(BATCH, (n) => ctx.db.query('folders').withIndex('by_site_parent', (q) => q.eq('site', id)).take(n))
    await sweep(BATCH, (n) => ctx.db.query('uploadTickets').withIndex('by_site', (q) => q.eq('site', id)).take(n))
    await sweep(BATCH, (n) => ctx.db.query('slugs').withIndex('by_key', (q) => q.eq('site', id)).take(n))
    await sweep(HEAVY_BATCH, (n) => ctx.db.query('entries').withIndex('by_site_brick_order', (q) => q.eq('site', id)).take(n))
    await sweep(HEAVY_BATCH, (n) => ctx.db.query('changes').withIndex('by_site_at', (q) => q.eq('site', id)).take(n))
    await sweep(HEAVY_BATCH, (n) => ctx.db.query('proposals').withIndex('by_site', (q) => q.eq('site', id)).take(n))
    await sweep(BATCH, (n) => ctx.db.query('releases').withIndex('by_site', (q) => q.eq('site', id)).take(n))
    await sweep(BATCH, (n) => ctx.db.query('ops').withIndex('by_site_actor_op', (q) => q.eq('site', id)).take(n))
    await sweep(BATCH, (n) => ctx.db.query('migrationsApplied').withIndex('by_site_id', (q) => q.eq('site', id)).take(n))
    await sweep(BATCH, (n) => ctx.db.query('views').withIndex('by_site_user_brick', (q) => q.eq('site', id)).take(n))
    await sweep(BATCH, (n) => ctx.db.query('reminders').withIndex('by_site_brick_week_user', (q) => q.eq('site', id)).take(n))
    await sweep(BATCH, (n) => ctx.db.query('rateWindows').withIndex('by_site_window', (q) => q.eq('site', id)).take(n))
    await sweep(BATCH, (n) => ctx.db.query('agentKeys').withIndex('by_site_user', (q) => q.eq('site', id)).take(n))
    await sweep(BATCH, (n) => ctx.db.query('pushKeys').withIndex('by_site', (q) => q.eq('site', id)).take(n))
    await sweep(BATCH, (n) => ctx.db.query('invites').withIndex('by_site', (q) => q.eq('site', id)).take(n))
    await sweep(BATCH, (n) => ctx.db.query('memberships').withIndex('by_site', (q) => q.eq('site', id)).take(n))

    // The site row goes in the same transaction that found every other table empty, so no orphan can follow.
    if (more) await ctx.scheduler.runAfter(0, internal.siteDeletion.purge, { site: id })
    else await ctx.db.delete(id)
    return null
  },
})
