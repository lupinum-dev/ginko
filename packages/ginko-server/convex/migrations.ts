// One-time data migrations of the platform, run by themselves after each deploy: the build script calls
// `migrations:runPending` right after `convex deploy`. The list and the runner are in lib/migrations.ts; every
// migration has its entry in internals/migrations.md. Progress: `npx convex run ops:status`.
import { carryPrints, entryBytes, mapMarkdownTexts, stableJson, type Schema } from '@lupinum/ginko/internal'
import { v } from 'convex/values'
import type { Doc, Id } from './_generated/dataModel'
import { internalMutation, type MutationCtx } from './_generated/server'
import { treesOf, type Data, type Prints } from './lib/content'
import { advance as advanceRun, runPending as startPending, stepArgs } from './lib/migrations'
import { putTrees } from './lib/trees'
import { entryUses, syncEntryRefs } from './lib/write'

/**
 * Starts what is pending after a deploy and returns one line for the build log (lib/migrations.ts `runPending`).
 * `npx convex run --prod migrations:runPending` in the build script; safe to call at any time.
 */
export const runPending = internalMutation({
  args: {},
  handler: (ctx): Promise<string> => startPending(ctx),
})

/** The end of an action step's page (mutation steps call lib/migrations.ts `advance` in their own transaction). */
export const advance = internalMutation({
  args: { run: v.id('serverMigrations'), next: v.union(v.string(), v.null()) },
  handler: (ctx, args): Promise<null> => advanceRun(ctx, args.run, args.next),
})

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
 * site counters are recounted (the list runs `entries:recountStorage` after it). A migration step, 10 entries per page.
 */
export const markdownStorageUrls = internalMutation({
  args: stepArgs,
  handler: async (ctx, args): Promise<null> => {
    const page = await ctx.db.query('entries').paginate({ cursor: args.cursor, numItems: 10 })
    const sites = new Map<Id<'sites'>, { site: Doc<'sites'> | null } & TokenScan>()
    const touched = new Set<Id<'sites'>>()
    for (const row of page.page) {
      if (!sites.has(row.site)) sites.set(row.site, { site: await ctx.db.get(row.site), found: new Map() })
      const known = sites.get(row.site)!
      const schema = known.site?.schema as Schema | undefined
      const brick = schema && Object.hasOwn(schema.bricks, row.brick) ? schema.bricks[row.brick]! : undefined
      if (!schema || !brick) continue
      const tokens = new Set<string>()
      mapMarkdownTexts(brick.fields, row.data, (text) => { for (const m of text.matchAll(STORAGE_URL)) tokens.add(m[1]!); return text })
      if (!tokens.size) continue
      const uploads = await uploadTokens(ctx, row.site, tokens, known)
      const data = mapMarkdownTexts(brick.fields, row.data, (text) => text.replace(STORAGE_URL, (url, token: string) => {
        const upload = uploads.get(token)
        return upload ? `$file.${upload}` : url
      })) as Data
      if (stableJson(data) === stableJson(row.data)) continue
      const trees = row.deletedAt === undefined ? await treesOf(brick.fields, data) : { json: '', bytes: 0 }
      // A changed field raises its revision like a save: a Studio draft that still holds the old addresses gets a
      // conflict instead of saving over the migrated text.
      const rev = row.rev + 1
      const fieldRevs = { ...row.fieldRevs }
      for (const root of Object.keys(data)) if (stableJson(data[root] ?? null) !== stableJson(row.data[root] ?? null)) fieldRevs[root] = rev
      // The same picture under its new name: a translation that was current stays current.
      const prints = carryPrints(brick.fields, row.data as Data, data, row.prints as Prints, schema.locales[0]!)
      await ctx.db.patch(row._id, { data, rev, fieldRevs, prints, bytes: entryBytes(data, prints), treeBytes: trees.bytes })
      await putTrees(ctx, row.site, row._id, trees.json)
      await syncEntryRefs(ctx, row.site, row._id, await entryUses(ctx, brick.fields, data, schema.locales))
      if (row.deletedAt === undefined && row.state !== 'draft') touched.add(row.site)
    }
    // The bundle now serves the files' sizes and variants: its caches must refresh.
    for (const id of touched) {
      const site = await ctx.db.get(id)
      if (site) await ctx.db.patch(id, { contentRev: site.contentRev + 1 })
    }
    return advanceRun(ctx, args.run, page.isDone ? null : page.continueCursor)
  },
})

/** What one run learned of a site's storage addresses: token → upload, and the site's uploads not yet read. */
interface TokenScan { found: Map<string, Id<'uploads'>>; rest?: AsyncIterator<Doc<'uploads'>> }

/**
 * The uploads behind `tokens` (storage address tokens of one text) among the current addresses of the site's uploads
 * (original, processed file, variants). Reads the site's uploads only until every token is known and remembers what it
 * read in `scan` for the next entry of the run, so a run asks for the address of each file at most once.
 */
async function uploadTokens(ctx: MutationCtx, site: Id<'sites'>, tokens: ReadonlySet<string>, scan: TokenScan): Promise<Map<string, Id<'uploads'>>> {
  scan.rest ??= ctx.db.query('uploads').withIndex('by_site', (q) => q.eq('site', site))[Symbol.asyncIterator]()
  while ([...tokens].some((token) => !scan.found.has(token))) {
    const next = await scan.rest.next()
    if (next.done) break
    const upload = next.value
    for (const id of [upload.processedId, upload.storageId, ...(upload.variants ?? []).map((variant) => variant.storageId)]) {
      const token = id === undefined ? undefined : tokenOf(await ctx.storage.getUrl(id))
      if (token && !scan.found.has(token)) scan.found.set(token, upload._id)
    }
  }
  return scan.found
}
