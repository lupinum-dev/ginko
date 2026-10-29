// Unpublished changes (save without publishing): Speichern on a live entry, of a collection or a single, keeps the
// changed fields in `pendingChanges` instead of the entry. The website reads only the entry, the Studio reads both
// (`overlay`). Publishing writes them through the normal write path (entries.ts `applyPending` → `commitEntry`).
import type { Schema } from '@lupinum/ginko/internal'
import type { Doc, Id } from '../_generated/dataModel'
import type { MutationCtx, QueryCtx } from '../_generated/server'
import { fileIdsOf, type Data, type Prints } from './content'
import { syncFileRefs, uploadIdsOf } from './write'

export type Pending = Doc<'pendingChanges'>

/** Whether a save of this entry waits as an unpublished change: every live entry does (a draft takes the save itself). */
export function keepsPending(entry: Pick<Doc<'entries'>, 'state'>): boolean {
  return (entry.state ?? 'live') === 'live'
}

export function pendingOf(ctx: QueryCtx, entry: Id<'entries'>): Promise<Pending | null> {
  return ctx.db.query('pendingChanges').withIndex('by_entry', (q) => q.eq('entry', entry)).unique()
}

/** The site's unpublished changes by entry: one read for a list of entries. */
export async function pendingBySite(ctx: QueryCtx, site: Id<'sites'>): Promise<Map<string, Pending>> {
  const rows = await ctx.db.query('pendingChanges').withIndex('by_site', (q) => q.eq('site', site)).collect()
  return new Map(rows.map((row) => [row.entry as string, row]))
}

export const underRoot = (leaf: string, root: string) => leaf === root || leaf.startsWith(`${root}.`)

/** The entry as its unpublished changes make it: their fields and the prints under them over the stored ones. */
export function overlay(entry: Pick<Doc<'entries'>, 'data' | 'prints'>, pending: Pending | null | undefined): { data: Data; prints: Prints } {
  if (!pending) return { data: entry.data as Data, prints: entry.prints }
  const roots = Object.keys(pending.fields)
  const data: Data = { ...(entry.data as Data) }
  for (const root of roots) {
    const value = pending.fields[root]
    if (value === null || value === undefined) delete data[root]
    else data[root] = value
  }
  const prints: Prints = Object.fromEntries(Object.entries(entry.prints).filter(([leaf]) => !roots.some((r) => underRoot(leaf, r))))
  Object.assign(prints, pending.prints)
  return { data, prints }
}

/** What the Studio shows about unpublished changes: since when, the last save, the fields, a planned time. */
export function pendingInfo(pending: Pending, user?: string) {
  return {
    since: pending.since,
    at: pending.at,
    fields: Object.keys(pending.fields),
    ...(pending.publishAt === undefined ? {} : { publishAt: pending.publishAt }),
    ...(user !== undefined && pending.by === user ? { own: true } : {}),
  }
}

/**
 * Keeps the file references of an entry's unpublished changes (holder 'pending', one per entry) to exactly the files
 * they name, so the uploads sweep, the "unused" view and the trash treat those files as in use.
 */
export async function syncPendingRefs(ctx: MutationCtx, schema: Schema, pending: Pick<Pending, 'site' | 'entry' | 'brick' | 'fields'>) {
  const brick = Object.hasOwn(schema.bricks, pending.brick) ? schema.bricks[pending.brick] : undefined
  const ids = brick ? fileIdsOf(brick.fields, pending.fields as Data, { isUploadId: uploadIdsOf(ctx) }) : new Set<string>()
  await syncFileRefs(ctx, pending.site, 'pending', pending.entry, ids)
}

/**
 * Takes `roots` out of the unpublished changes after a save put them online at once (`entries.save` with `publish`):
 * the published value replaces what waited, the other fields keep waiting. An empty set goes with its planned publish.
 */
export async function dropPendingRoots(ctx: MutationCtx, schema: Schema, held: Pending, roots: readonly string[]) {
  if (!roots.some((r) => Object.hasOwn(held.fields, r))) return
  const fields = Object.fromEntries(Object.entries(held.fields).filter(([r]) => !roots.includes(r)))
  if (!Object.keys(fields).length) return dropPending(ctx, held)
  const revs = Object.fromEntries(Object.entries(held.revs).filter(([r]) => !roots.includes(r)))
  const prints = Object.fromEntries(Object.entries(held.prints).filter(([leaf]) => !roots.some((r) => underRoot(leaf, r))))
  await ctx.db.patch(held._id, { fields, revs, prints })
  await syncPendingRefs(ctx, schema, { ...held, fields })
}

/** Deletes unpublished changes with their planned publish (unless that run is the one calling) and file references. */
export async function dropPending(ctx: MutationCtx, held: Pending, running = false) {
  if (held.publishJob && !running) await ctx.scheduler.cancel(held.publishJob)
  await syncFileRefs(ctx, held.site, 'pending', held.entry, new Set())
  await ctx.db.delete(held._id)
}
