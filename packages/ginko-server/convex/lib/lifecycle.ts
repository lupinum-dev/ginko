// Entry lifecycle shared by the entry operations and the retention job (SPEC 4.2, 12),
// so a removal writes the same fields and counters wherever it happens.
import type { Doc, Id } from '../_generated/dataModel'
import type { MutationCtx } from '../_generated/server'
import type { By } from './access'
import type { Recorded } from './history'
import { dropTrees } from './trees'

/** A removed entry can be restored this long, then retention deletes it for good (SPEC 12). */
export const DELETED_KEPT = 30 * 24 * 60 * 60 * 1000

/** Site values one operation changes, changed in memory and written back once. `entryCount` counts live entries; `bytes` counts every stored row; `treeBytes` the stored trees of the live ones. */
export interface Counters {
  contentRev: number
  entryCount: number
  bytes: number
  treeBytes: number
  orderRevs: Record<string, number>
}

export const countersOf = (site: Doc<'sites'>): Counters => ({
  contentRev: site.contentRev, entryCount: site.entryCount, bytes: site.bytes, treeBytes: site.treeBytes ?? 0, orderRevs: { ...site.orderRevs },
})

export async function writeCounters(ctx: MutationCtx, site: Id<'sites'>, c: Counters) {
  await ctx.db.patch(site, { contentRev: c.contentRev, entryCount: c.entryCount, bytes: c.bytes, treeBytes: c.treeBytes, orderRevs: c.orderRevs })
}

/** The byte counters of a site as the sums over its entry rows: what every write keeps them equal to. */
export function storageSums(rows: readonly Pick<Doc<'entries'>, 'deletedAt' | 'bytes' | 'treeBytes'>[]) {
  let bytes = 0
  let treeBytes = 0
  for (const row of rows) {
    bytes += row.bytes
    if (row.deletedAt === undefined) treeBytes += row.treeBytes ?? 0
  }
  return { bytes, treeBytes }
}

/**
 * Soft-deletes one entry (SPEC 4.2 remove): `deletedAt`, lifeRev+1, one change row. Its slug stays reserved and its
 * file references stay; its trees go (the trash keeps none). `bytes` counts every stored row until the hard delete
 * (SPEC 12). A draft was never in the bundle, so removing it leaves `contentRev` alone; a scheduled draft loses its
 * job and its time.
 */
export async function softRemove(ctx: MutationCtx, c: Counters, entry: Doc<'entries'>, opId: string, by: By, history: Recorded, at = Date.now()) {
  // rev counts every change of the entry (SPEC 3), structural ones included.
  await ctx.db.patch(entry._id, { deletedAt: at, lifeRev: entry.lifeRev + 1, rev: entry.rev + 1, publishAt: undefined, publishJob: undefined, trees: undefined, treeBytes: 0 })
  await dropTrees(ctx, entry._id)
  if (entry.publishJob) await ctx.scheduler.cancel(entry.publishJob)
  c.entryCount -= 1
  c.treeBytes -= entry.treeBytes ?? 0
  if (entry.state !== 'draft') c.contentRev += 1
  c.orderRevs[entry.brick] = (c.orderRevs[entry.brick] ?? 0) + 1
  await ctx.db.insert('changes', {
    site: entry.site, entry: entry._id, brick: entry.brick, ...by, opId, kind: 'remove', ...history,
    entryRev: entry.rev + 1, contentRev: c.contentRev, at,
  })
}

/** Deletes a removed entry for good: its slugs, file references, trees and the row. Its changes stay for a year (SPEC 12). */
export async function purgeEntry(ctx: MutationCtx, c: Counters, row: Doc<'entries'>) {
  for (const slug of await ctx.db.query('slugs').withIndex('by_entry', (q) => q.eq('entry', row._id)).collect()) await ctx.db.delete(slug._id)
  const refs = await ctx.db.query('fileRefs').withIndex('by_holder', (q) => q.eq('holder', 'entry').eq('holderId', row._id)).collect()
  for (const ref of refs) await ctx.db.delete(ref._id)
  await dropTrees(ctx, row._id)
  await ctx.db.delete(row._id)
  // entryCount already dropped at the soft delete; only the stored bytes go now.
  c.bytes -= row.bytes
}
