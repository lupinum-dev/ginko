// One-time migration for 0.4.0 (@lupinum/ginko-components renamed tags and props, see lib/componentMarkup.ts):
// rewrites the Markdown of every entry (live, draft and deleted) and of the history rows, so saved texts keep
// working and an undo restores the new names. Idempotent: run it again and nothing changes.
// Run once after the platform deploy: `npx convex run migrateComponentMarkup:run`. It works in batches and
// schedules itself until both tables are done.
import { v } from 'convex/values'
import type { Schema } from '@lupinum/ginko/internal'
import { internal } from './_generated/api'
import type { Doc, Id } from './_generated/dataModel'
import { internalMutation, type MutationCtx } from './_generated/server'
import { renameInEntry, renameInValues } from './lib/componentMarkup'
import { byteSize, type Data, type Prints } from './lib/content'

const BATCH = 100

export const run = internalMutation({
  args: { table: v.optional(v.union(v.literal('entries'), v.literal('changes'))), cursor: v.optional(v.union(v.string(), v.null())) },
  handler: async (ctx, args): Promise<{ table: 'entries' | 'changes'; rewritten: number }> => {
    const table = args.table ?? 'entries'
    const schemas = new Map<Id<'sites'>, Schema | null>()
    const schemaOf = async (site: Id<'sites'>) => {
      if (!schemas.has(site)) schemas.set(site, ((await ctx.db.get(site))?.schema as Schema | undefined) ?? null)
      return schemas.get(site)!
    }
    const page = await ctx.db.query(table).paginate({ cursor: args.cursor ?? null, numItems: BATCH })
    const rewritten = table === 'entries'
      ? await rewriteEntries(ctx, page.page as Doc<'entries'>[], schemaOf)
      : await rewriteChanges(ctx, page.page as Doc<'changes'>[], schemaOf)
    if (!page.isDone) await ctx.scheduler.runAfter(0, internal.migrateComponentMarkup.run, { table, cursor: page.continueCursor })
    else if (table === 'entries') await ctx.scheduler.runAfter(0, internal.migrateComponentMarkup.run, { table: 'changes', cursor: null })
    return { table, rewritten }
  },
})

type SchemaOf = (site: Id<'sites'>) => Promise<Schema | null>

/** Like a save: rev+1 and the field revs of the changed roots, new bytes; contentRev+1 when a live entry changed. */
async function rewriteEntries(ctx: MutationCtx, entries: Doc<'entries'>[], schemaOf: SchemaOf): Promise<number> {
  const sites = new Map<Id<'sites'>, { bytes: number; live: boolean }>()
  let count = 0
  for (const entry of entries) {
    const schema = await schemaOf(entry.site)
    const fields = schema?.bricks[entry.brick]?.fields
    if (!schema || !fields) continue
    const next = renameInEntry(fields, entry.data as Data, entry.prints as Prints, schema.locales[0]!)
    if (!next.roots.length) continue
    const rev = entry.rev + 1
    const bytes = byteSize(next.data) + byteSize(next.prints)
    await ctx.db.patch(entry._id, {
      data: next.data, prints: next.prints, rev, bytes,
      fieldRevs: { ...entry.fieldRevs, ...Object.fromEntries(next.roots.map((root) => [root, rev])) },
    })
    const site = sites.get(entry.site) ?? { bytes: 0, live: false }
    site.bytes += bytes - entry.bytes
    site.live ||= entry.state !== 'draft' && entry.deletedAt === undefined
    sites.set(entry.site, site)
    count++
  }
  for (const [id, change] of sites) {
    const site = (await ctx.db.get(id))!
    await ctx.db.patch(id, { bytes: site.bytes + change.bytes, ...(change.live ? { contentRev: site.contentRev + 1 } : {}) })
  }
  return count
}

async function rewriteChanges(ctx: MutationCtx, changes: Doc<'changes'>[], schemaOf: SchemaOf): Promise<number> {
  let count = 0
  for (const change of changes) {
    const fields = (await schemaOf(change.site))?.bricks[change.brick]?.fields
    if (!fields) continue
    const patch: { before?: Data; after?: Data } = {}
    for (const key of ['before', 'after'] as const) {
      const values: unknown = change[key]
      if (typeof values !== 'object' || values === null || Array.isArray(values)) continue
      const next = renameInValues(fields, values as Data)
      if (JSON.stringify(next) !== JSON.stringify(values)) patch[key] = next
    }
    if (!Object.keys(patch).length) continue
    await ctx.db.patch(change._id, patch)
    count++
  }
  return count
}
