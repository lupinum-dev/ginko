// Unpublished changes (save without publishing): in a collection with drafts, Speichern on a live entry keeps the
// changed fields in `pendingChanges` instead of the entry. The website reads only the entry, the Studio reads both
// (`overlay`). Publishing writes them through the normal write path (entries.ts `applyPending` → `commitEntry`).
import type { Schema } from '@lupinum/ginko/internal'
import type { Doc, Id } from '../_generated/dataModel'
import type { QueryCtx } from '../_generated/server'
import type { Data, Prints } from './content'

export type Pending = Doc<'pendingChanges'>

/** Whether a save of this entry waits as an unpublished change: a live entry of a collection with drafts. */
export function keepsPending(schema: Schema, entry: Pick<Doc<'entries'>, 'brick' | 'state'>): boolean {
  const brick = Object.hasOwn(schema.bricks, entry.brick) ? schema.bricks[entry.brick] : undefined
  return brick?.kind === 'collection' && brick.drafts === true && (entry.state ?? 'live') === 'live'
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
