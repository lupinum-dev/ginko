// The change log of a site, newest first (SPEC 3). Any admin or member of the site may read it (SPEC 2.7).
import type { Json } from '@lupinum/ginko'
import type { Schema } from '@lupinum/ginko/internal'
import { paginationOptsValidator } from 'convex/server'
import { v } from 'convex/values'
import type { Doc, Id } from './_generated/dataModel'
import { query, type QueryCtx } from './_generated/server'
import { labeler } from './lib/names'
import { actorFor, fail, type Actor } from './lib/access'
import { diffFields } from './lib/diff'
import { undoBlockOf, type UndoBlock } from './lib/history'

const PAGE_SIZE = 50
/**
 * A change row stores the `before` and `after` of its fields and the prints, up to 2 x 480 KiB (SITE_BUDGET.entryBytes).
 * A page of 50 such rows would pass Convex's 16 MiB read limit, so a page also ends once it has read this much
 * and hands out the cursor for the rest.
 */
const PAGE_BYTES = 2 * 1024 * 1024

type ReadEntry = (id: Id<'entries'>) => Promise<Doc<'entries'> | null>

/**
 * The rows without before/after/prints (those are for undo and the release, not for the list: the
 * history page shows the message), with who did it as data (`Who`, lib/names.ts) and, for a change
 * through the agent door, the label of that person's key (SPEC 16). `inTrash`: a removal whose entry is
 * still in the trash (not restored, not deleted for good), so the Studio links there only while it is.
 */
async function summaries(ctx: QueryCtx, actor: Actor, rows: Doc<'changes'>[]) {
  const names = await labeler(ctx, actor)
  // Each entry is read once; the entries of a site fit in its storage budget, so this stays well under the read
  // limit, and the list follows later saves, restores and removals live.
  const read = new Map<Id<'entries'>, Promise<Doc<'entries'> | null>>()
  const readEntry: ReadEntry = (id) => {
    if (!read.has(id)) read.set(id, ctx.db.get(id))
    return read.get(id)!
  }
  const blocks = await undoBlocks(ctx, actor, rows, readEntry)
  const out = []
  for (const { before: _before, after: _after, printsBefore: _printsBefore, printsAfter: _printsAfter, ...change } of rows) {
    const inTrash = change.kind === 'remove' && !!change.entry && !!(await readEntry(change.entry))?.deletedAt
    out.push({ ...change, who: await names.who(change.actor), agent: await names.key(change.agentKey), undoBlocked: blocks.get(change._id) ?? null, inTrash })
  }
  return out
}

/** Why each save on the page can no longer be undone (undoBlockOf, the rule the undo mutation uses). */
async function undoBlocks(ctx: QueryCtx, actor: Actor, rows: Doc<'changes'>[], readEntry: ReadEntry): Promise<Map<Id<'changes'>, UndoBlock>> {
  const blocks = new Map<Id<'changes'>, UndoBlock>()
  if (!rows.some((row) => row.kind === 'save' && row.entry)) return blocks
  const migrated = await ctx.db.query('migrationsApplied').withIndex('by_site_id', (q) => q.eq('site', actor.site._id)).collect()
  for (const change of rows) {
    if (change.kind !== 'save' || !change.entry) continue
    const block = undoBlockOf(change, await readEntry(change.entry), migrated)
    if (block) blocks.set(change._id, block)
  }
  return blocks
}

/**
 * A paginated query (`useConvexPaginatedQuery` in the Studio): a page holds at most 50 rows. `entry`, `brick` and
 * `by` narrow the list on the server, so a page is rows of the filter and the cursor walks on in it; without them
 * it is the whole site. `by: 'me'` is what the signed-in person did (also
 * through their own agent key), `by: 'ai'` everything done through the agent door.
 */
export const list = query({
  args: {
    site: v.string(), paginationOpts: paginationOptsValidator, entry: v.optional(v.string()), brick: v.optional(v.string()),
    by: v.optional(v.union(v.literal('me'), v.literal('ai'))),
  },
  handler: async (ctx, args) => {
    const actor = await actorFor(ctx, args.site)
    const siteId = actor.site._id
    const entry = args.entry === undefined ? undefined : ctx.db.normalizeId('entries', args.entry)
    if (args.entry !== undefined && !entry) fail('NOT_FOUND', 'errors.entryNotFound')
    const brick = args.brick
    const by = args.by
    const me = actor.user.id
    // The index narrows by entry, else by who, else by brick; what it does not cover is a filter on the same walk.
    const rows = entry
      ? ctx.db.query('changes').withIndex('by_entry', (q) => q.eq('entry', entry)).order('desc')
        .filter((q) => q.and(
          q.eq(q.field('site'), siteId),
          brick === undefined ? true : q.eq(q.field('brick'), brick),
          by === undefined ? true : by === 'me' ? q.eq(q.field('actor'), me) : q.eq(q.field('via'), 'agent'),
        ))
      : by !== undefined
        ? (by === 'me'
          ? ctx.db.query('changes').withIndex('by_site_actor_at', (q) => q.eq('site', siteId).eq('actor', me))
          : ctx.db.query('changes').withIndex('by_site_via_at', (q) => q.eq('site', siteId).eq('via', 'agent')))
          .order('desc').filter((q) => (brick === undefined ? true : q.eq(q.field('brick'), brick)))
        : brick !== undefined
          ? ctx.db.query('changes').withIndex('by_site_brick_at', (q) => q.eq('site', siteId).eq('brick', brick)).order('desc')
          : ctx.db.query('changes').withIndex('by_site_at', (q) => q.eq('site', siteId)).order('desc')
    const opts = args.paginationOpts
    let result
    try {
      result = await rows.paginate({ ...opts, numItems: Math.min(opts.numItems, PAGE_SIZE), maximumBytesRead: PAGE_BYTES })
    } catch (error) {
      // The cursor comes from the client; the database refuses one it did not hand out.
      if (opts.cursor === null) throw error
      fail('INVALID', 'errors.pageMarkerInvalid')
    }
    return { ...result, page: await summaries(ctx, actor, result.page) }
  },
})

/** One change as in `list`, plus its field-level `diff` (SPEC 4.2 "Verlauf"). A change of another site does not exist. */
export const get = query({
  args: { site: v.string(), change: v.string() },
  handler: async (ctx, args) => {
    const actor = await actorFor(ctx, args.site)
    const id = ctx.db.normalizeId('changes', args.change)
    const change = id ? await ctx.db.get(id) : null
    if (!change || change.site !== actor.site._id) fail('NOT_FOUND', 'errors.changeNotFound')
    const schema = actor.site.schema as Schema
    const brick = Object.hasOwn(schema.bricks, change.brick) ? schema.bricks[change.brick] : undefined
    // before/after hold exactly the changed roots; a change without fields (publish, remove) has no field diff.
    const diff = diffFields(brick?.fields, (change.before ?? {}) as Record<string, Json>, (change.after ?? {}) as Record<string, Json>, schema.locales[0]!)
    const [summary] = await summaries(ctx, actor, [change])
    return { ...summary!, diff }
  },
})
