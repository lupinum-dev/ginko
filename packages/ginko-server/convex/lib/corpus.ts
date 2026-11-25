// Demo content from a corpus (contracts/<site>/data.json), shared by the local reset (seed.ts) and
// the demo fill (demo.ts): the entries with their slugs and counters, and invites for the demo people.
import type { Json } from '@lupinum/ginko'
import { changeIssues, dataOn, entryBytes, namesOf, sha256, isException, keptChanges, todayIn, type Change, type Schema } from '@lupinum/ginko/internal'
import type { Doc } from '../_generated/dataModel'
import type { MutationCtx } from '../_generated/server'
import { checkGrants, normalizeEmail } from '../members'
import { treesOf } from './content'
import { insertWaiting } from './dated'
import { putTrees } from './trees'

/** `changes`: dated changes (D125); a passed one is written into `data`, a waiting one gets its row and its run. */
type CorpusEntry = { id: string; order?: number; data: Record<string, Json>; prints?: Record<string, Record<string, string>>; changes?: Change[] }

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
    // A rows field keeps its rows: only its file cells go.
    if (field?.type === 'rows' && value && typeof value === 'object' && !Array.isArray(value)) {
      const files = Object.keys(field.of).filter((k) => field.of[k]!.type === 'image' || field.of[k]!.type === 'file')
      out[key] = files.length ? Object.fromEntries(Object.entries(value).map(([row, cells]) => [row, cells && typeof cells === 'object' && !Array.isArray(cells) ? Object.fromEntries(Object.entries(cells).filter(([k]) => !files.includes(k))) : cells])) : value
      continue
    }
    out[key] = value
  }
  return out
}

export type Corpus = Record<string, CorpusEntry[]>
export type Person = { email: string; role: 'owner' | 'staff'; grants: string[] }

/** Inserts the corpus entries of the bricks the site knows; sets the byte counters and entryCount, and raises contentRev. */
export async function insertCorpus(ctx: MutationCtx, site: Doc<'sites'>, corpus: Corpus) {
  const schema = site.schema as Schema
  let bytes = 0
  let treeBytes = 0
  let count = 0
  const today = todayIn(schema.timeZone)
  for (const [brick, rows] of Object.entries(corpus)) {
    const def = schema.bricks[brick]
    if (!def) continue
    // Corpus entries are online, so their names (D96) are fixed: from the main slug or the title, as the upgrade makes them.
    const names = def.kind === 'collection' ? namesOf(brick, def, schema.locales[0]!, rows.map((row) => withoutFiles(schema, brick, row.data))) : []
    for (const [index, row] of rows.entries()) {
      const changes = row.changes ?? []
      const problem = changes.length ? (await changeIssues(schema, brick, row.data, changes))[0] : undefined
      if (problem) throw new Error(`corpus ${brick}/${row.id}: ${problem.path} ${problem.message}`)
      const data = withoutFiles(schema, brick, dataOn(row.data, changes.filter((c) => !isException(c)), today))
      const prints = row.prints ?? {}
      const size = entryBytes(data, prints)
      const trees = await treesOf(def.fields, data)
      const fieldRevs = Object.fromEntries(Object.keys(def.fields).map((f) => [f, 1]))
      const id = await ctx.db.insert('entries', {
        site: site._id, brick, kind: def.kind === 'single' ? 'single' : 'item', order: row.order ?? index + 1,
        data, rev: 1, fieldRevs, lifeRev: 1, prints, bytes: size, treeBytes: trees.bytes, contentAt: Date.now(),
        ...(def.kind === 'collection' ? { name: names[index]!, nameFixed: true as const } : {}),
      })
      await putTrees(ctx, site._id, id, trees.json)
      await insertWaiting(ctx, schema, { _id: id, site: site._id, brick, rev: 1 }, keptChanges(changes, today))
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
  await ctx.db.patch(site._id, { bytes, trashBytes: 0, treeBytes, entryCount: count, contentRev: site.contentRev + 1 })
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
