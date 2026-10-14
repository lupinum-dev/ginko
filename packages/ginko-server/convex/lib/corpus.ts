// Demo content from a corpus (contracts/<site>/data.json), shared by the local reset (seed.ts) and
// the demo fill (demo.ts): the entries with their slugs and counters, and invites for the demo people.
import type { Json } from '@lupinum/ginko'
import { entryBytes, sha256, type Schema } from '@lupinum/ginko/internal'
import type { Doc } from '../_generated/dataModel'
import type { MutationCtx } from '../_generated/server'
import { checkGrants, normalizeEmail } from '../members'
import { treesOf } from './content'
import { putTrees } from './trees'

type CorpusEntry = { id: string; order?: number; data: Record<string, Json>; prints?: Record<string, Record<string, string>> }

/** File fields point at uploads; the corpus names files that do not exist here, so they are left out. */
function withoutFiles(schema: Schema, brick: string, data: Record<string, Json>): Record<string, Json> {
  const fields = schema.bricks[brick]!.fields
  const out: Record<string, Json> = {}
  for (const [key, value] of Object.entries(data)) {
    const field = fields[key]
    if (field?.type === 'image' || field?.type === 'file') continue
    if (field?.type === 'list' && Array.isArray(value) && Object.values(field.of).some((f) => f.type === 'image' || f.type === 'file')) {
      out[key] = []
      continue
    }
    out[key] = value
  }
  return out
}

export type Corpus = Record<string, CorpusEntry[]>
export type Person = { email: string; role: 'owner' | 'staff'; grants: string[] }

/** Inserts the corpus entries of the bricks the site knows; sets the byte counters, entryCount and orderRevs, and raises contentRev. */
export async function insertCorpus(ctx: MutationCtx, site: Doc<'sites'>, corpus: Corpus) {
  const schema = site.schema as Schema
  let bytes = 0
  let treeBytes = 0
  let count = 0
  const orderRevs: Record<string, number> = {}
  for (const [brick, rows] of Object.entries(corpus)) {
    const def = schema.bricks[brick]
    if (!def) continue
    orderRevs[brick] = 1
    for (const [index, row] of rows.entries()) {
      const data = withoutFiles(schema, brick, row.data)
      const prints = row.prints ?? {}
      const size = entryBytes(data, prints)
      const trees = await treesOf(def.fields, data)
      const fieldRevs = Object.fromEntries(Object.keys(def.fields).map((f) => [f, 1]))
      const id = await ctx.db.insert('entries', {
        site: site._id, brick, kind: def.kind === 'single' ? 'single' : 'item', order: row.order ?? index + 1,
        data, rev: 1, fieldRevs, lifeRev: 1, prints, bytes: size, treeBytes: trees.bytes,
      })
      await putTrees(ctx, site._id, id, trees.json)
      bytes += size
      treeBytes += trees.bytes
      count++
      for (const [name, field] of Object.entries(def.fields)) {
        if (field.type !== 'slug') continue
        for (const [locale, slug] of Object.entries((data[name] ?? {}) as Record<string, string>)) {
          await ctx.db.insert('slugs', { site: site._id, brick, locale, slug, entry: id })
        }
      }
    }
  }
  await ctx.db.patch(site._id, { bytes, treeBytes, entryCount: count, orderRevs, contentRev: site.contentRev + 1 })
  return { count }
}

/** One invite per person (7 days); returns the links, which a local or demo setup hands out directly. */
export async function invitePeople(ctx: MutationCtx, site: Doc<'sites'>, people: Person[], invitedBy: string) {
  const schema = site.schema as Schema
  const origin = (process.env.SITE_URL ?? 'http://localhost:3100').replace(/\/$/, '')
  const links: { email: string; role: string; link: string }[] = []
  for (const person of people) {
    const bytes32 = crypto.getRandomValues(new Uint8Array(32))
    const token = btoa(String.fromCharCode(...bytes32)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
    const email = normalizeEmail(person.email)
    await ctx.db.insert('invites', {
      site: site._id, email, role: person.role, grants: person.role === 'owner' ? [] : checkGrants(schema, person.grants),
      tokenHash: sha256(token), invitedBy, expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
    })
    links.push({ email, role: person.role, link: `${origin}/invite/${token}` })
  }
  return links
}
