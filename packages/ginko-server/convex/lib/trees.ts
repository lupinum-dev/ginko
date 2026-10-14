// The Markdown trees of an entry in their own table (`entryTrees` in schema.ts), split into parts below Convex's
// 1 MiB document limit. The only code that reads or writes that table.
import type { MarkdownTrees } from '@lupinum/ginko/internal'
import type { Id } from '../_generated/dataModel'
import type { MutationCtx, QueryCtx } from '../_generated/server'

/** UTF-16 units per part: at most about 900 KB of UTF-8, under the 1 MiB a document may hold. */
const PART = 300_000

/** `json` in pieces of at most `size` units. A cut never falls inside a surrogate pair: Convex cannot store a lone surrogate. */
export function splitParts(json: string, size = PART): string[] {
  const parts: string[] = []
  for (let at = 0; at < json.length;) {
    let end = Math.min(at + size, json.length)
    const last = json.charCodeAt(end - 1)
    if (end < json.length && last >= 0xd800 && last <= 0xdbff) end--
    parts.push(json.slice(at, end))
    at = end
  }
  return parts
}

/** Replaces the stored trees of `entry` with `json` (from lib/content `treesOf`); an empty text stores nothing. */
export async function putTrees(ctx: MutationCtx, site: Id<'sites'>, entry: Id<'entries'>, json: string) {
  await dropTrees(ctx, entry)
  for (const [part, text] of splitParts(json).entries()) await ctx.db.insert('entryTrees', { site, entry, part, json: text })
}

/** The stored trees of `entry` as JSON text; '' when it has none. */
export async function readTreesJson(ctx: QueryCtx, entry: Id<'entries'>): Promise<string> {
  const parts = await ctx.db.query('entryTrees').withIndex('by_entry', (q) => q.eq('entry', entry)).collect()
  return parts.map((p) => p.json).join('')
}

/** The stored trees of `entry`, or undefined when it has none (its texts are then parsed per request). */
export async function readTrees(ctx: QueryCtx, entry: Id<'entries'>): Promise<MarkdownTrees | undefined> {
  const json = await readTreesJson(ctx, entry)
  return json ? (JSON.parse(json) as MarkdownTrees) : undefined
}

export async function dropTrees(ctx: MutationCtx, entry: Id<'entries'>) {
  for (const row of await ctx.db.query('entryTrees').withIndex('by_entry', (q) => q.eq('entry', entry)).collect()) await ctx.db.delete(row._id)
}
