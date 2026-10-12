// Entry lifecycle shared by the entry operations and the retention job (SPEC 4.2, 12),
// so a removal writes the same fields and counters wherever it happens.
import type { Doc, Id } from '../_generated/dataModel'
import type { MutationCtx } from '../_generated/server'
import type { By } from './access'
import type { Recorded } from './history'

/** A removed entry can be restored this long, then retention deletes it for good (SPEC 12). */
export const DELETED_KEPT = 30 * 24 * 60 * 60 * 1000

export interface Counters {
  contentRev: number
  entryCount: number
  bytes: number
  orderRevs: Record<string, number>
}

export const countersOf = (site: Doc<'sites'>): Counters => ({
  contentRev: site.contentRev, entryCount: site.entryCount, bytes: site.bytes, orderRevs: { ...site.orderRevs },
})

export async function writeCounters(ctx: MutationCtx, site: Id<'sites'>, c: Counters) {
  await ctx.db.patch(site, { contentRev: c.contentRev, entryCount: c.entryCount, bytes: c.bytes, orderRevs: c.orderRevs })
}

/**
 * Soft-deletes one entry (SPEC 4.2 remove): `deletedAt`, lifeRev+1, one change row. Its slug
 * stays reserved and its file references stay. `entryCount` counts live entries; `bytes` counts
 * every stored row until the hard delete (SPEC 12). A draft was never in the bundle, so removing
 * it leaves `contentRev` alone; a scheduled draft loses its job and its time.
 */
export async function softRemove(ctx: MutationCtx, c: Counters, entry: Doc<'entries'>, opId: string, by: By, history: Recorded, at = Date.now()) {
  // rev counts every change of the entry (SPEC 3), structural ones included.
  await ctx.db.patch(entry._id, { deletedAt: at, lifeRev: entry.lifeRev + 1, rev: entry.rev + 1, publishAt: undefined, publishJob: undefined })
  if (entry.publishJob) await ctx.scheduler.cancel(entry.publishJob)
  c.entryCount -= 1
  if (entry.state !== 'draft') c.contentRev += 1
  c.orderRevs[entry.brick] = (c.orderRevs[entry.brick] ?? 0) + 1
  await ctx.db.insert('changes', {
    site: entry.site, entry: entry._id, brick: entry.brick, ...by, opId, kind: 'remove', ...history,
    entryRev: entry.rev + 1, contentRev: c.contentRev, at,
  })
}

