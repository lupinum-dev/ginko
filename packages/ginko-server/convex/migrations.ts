// One-time migrations of stored content, run by hand (`npx convex run migrations:<name>`). Each works in small pages,
// schedules itself and is safe to run again. Every one has its entry in internals/migrations.md; remove both together.
import { entryBytes, mapMarkdownTexts, stableJson, type Schema } from '@lupinum/ginko/internal'
import { v } from 'convex/values'
import type { Doc, Id } from './_generated/dataModel'
import { internal } from './_generated/api'
import { internalMutation, type MutationCtx } from './_generated/server'
import { treesOf, type Data } from './lib/content'
import { putTrees } from './lib/trees'
import { entryUses, syncEntryRefs } from './lib/write'

/** A storage address in a text, with or without its host: group 1 is its token (everything after `/api/storage/`). */
const STORAGE_URL = /(?:https?:\/\/[^\s()<>"'\]]+?)?\/api\/storage\/([^\s()<>"']+)/g

/** The token of a storage address, or undefined. */
const tokenOf = (url: string | null) => (url ? /\/api\/storage\/([^\s()<>"']+)/.exec(url)?.[1] : undefined)

/**
 * Markdown texts that hold a picture as its storage address (`http://127.0.0.1:3210/api/storage/…`, written by the
 * editor before `$file.<id>` existed) get the reference instead: the file then counts as used (the daily sweep keeps
 * it, Trash warns, backups take it) and the address no longer depends on the host it was written on. An address is
 * matched by its token against the current addresses of the site's uploads (original, processed file, variants);
 * an address that matches none stays as it is. Changed entries get new trees and file references; at the end the
 * site counters are recounted (`entries:recountStorage`). 10 entries per run.
 */
export const markdownStorageUrls = internalMutation({
  args: { cursor: v.optional(v.union(v.string(), v.null())) },
  handler: async (ctx, args): Promise<{ changed: number }> => {
    const page = await ctx.db.query('entries').paginate({ cursor: args.cursor ?? null, numItems: 10 })
    const sites = new Map<Id<'sites'>, { site: Doc<'sites'> | null; uploads: Map<string, Id<'uploads'>> | undefined }>()
    const touched = new Set<Id<'sites'>>()
    let changed = 0
    for (const row of page.page) {
      if (!sites.has(row.site)) sites.set(row.site, { site: await ctx.db.get(row.site), uploads: undefined })
      const known = sites.get(row.site)!
      const schema = known.site?.schema as Schema | undefined
      const brick = schema && Object.hasOwn(schema.bricks, row.brick) ? schema.bricks[row.brick]! : undefined
      if (!schema || !brick) continue
      let found = false
      mapMarkdownTexts(brick.fields, row.data, (text) => { if (text.includes('/api/storage/')) found = true; return text })
      if (!found) continue
      known.uploads ??= await uploadTokens(ctx, row.site)
      const uploads = known.uploads
      const data = mapMarkdownTexts(brick.fields, row.data, (text) => text.replace(STORAGE_URL, (url, token: string) => {
        const upload = uploads.get(token)
        return upload ? `$file.${upload}` : url
      })) as Data
      if (stableJson(data) === stableJson(row.data)) continue
      const trees = row.deletedAt === undefined ? await treesOf(brick.fields, data) : { json: '', bytes: 0 }
      await ctx.db.patch(row._id, { data, bytes: entryBytes(data, row.prints), treeBytes: trees.bytes })
      await putTrees(ctx, row.site, row._id, trees.json)
      await syncEntryRefs(ctx, row.site, row._id, await entryUses(ctx, brick.fields, data, schema.locales))
      if (row.deletedAt === undefined && row.state !== 'draft') touched.add(row.site)
      changed++
    }
    // The bundle now serves the files' sizes and variants: its caches must refresh.
    for (const id of touched) {
      const site = await ctx.db.get(id)
      if (site) await ctx.db.patch(id, { contentRev: site.contentRev + 1 })
    }
    if (!page.isDone) await ctx.scheduler.runAfter(0, internal.migrations.markdownStorageUrls, { cursor: page.continueCursor })
    else await ctx.scheduler.runAfter(0, internal.entries.recountStorage, {})
    return { changed }
  },
})

/** Token of every current storage address of the site's uploads → the upload. */
async function uploadTokens(ctx: MutationCtx, site: Id<'sites'>): Promise<Map<string, Id<'uploads'>>> {
  const out = new Map<string, Id<'uploads'>>()
  for (const upload of await ctx.db.query('uploads').withIndex('by_site', (q) => q.eq('site', site)).collect()) {
    const stored = [upload.processedId, upload.storageId, ...(upload.variants ?? []).map((variant) => variant.storageId)]
    for (const id of stored) {
      const token = id === undefined ? undefined : tokenOf(await ctx.storage.getUrl(id))
      if (token && !out.has(token)) out.set(token, upload._id)
    }
  }
  return out
}
