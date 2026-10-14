// Schema releases and push keys (SPEC 5, 10). The CLI reaches `release` and `state` through
// the HTTP routes in routes/release.ts, which resolve the push key to its site first; the
// internal functions here trust that site id. Owners and admins use the public mutations.
import type { Fields, Json, Locale } from '@lupinum/ginko'
import { byteSize, checkSchema, defaultsFor, entryBytes, fitsBudget, diffSchema, fieldsChanged, releaseData, sha256, stableJson, validate, type MigrationDescriptor, type Schema } from '@lupinum/ginko/internal'
import { v } from 'convex/values'
import type { Doc, Id } from './_generated/dataModel'
import type { MutationCtx, QueryCtx } from './_generated/server'
import { internalMutation, internalQuery, mutation } from './_generated/server'
import { actorFor, checkRev, fail } from './lib/access'
import { nextPrints, treesOf, type Data, type Prints } from './lib/content'
import { msg, recorded } from './lib/history'
import { isFetchableSiteUrl } from './lib/siteUrl'
import { storageSums } from './lib/lifecycle'
import { putTrees } from './lib/trees'
import { BUDGET, checkNewFiles, checkNewLinks, entryUses, overBudget, same, sizeText, syncEntryRefs } from './lib/write'
import { labelOf } from './entries'

const scope = v.union(v.literal('release'), v.literal('pull'), v.literal('check'), v.literal('export'))

/** SPEC 5.2 step 9. */
export const RELEASE_LIMITS = { documents: 4000, writes: 4000, argBytes: 8 * 1024 * 1024 } as const

// 32 symbols: 256 is a multiple of 32, so a random byte maps to each symbol equally often.
const KEY_ALPHABET = 'abcdefghijkmnpqrstuvwxyz23456789'

type Entry = Doc<'entries'>

const current = (site: Doc<'sites'>) => ({ schemaRev: site.schemaRev, contentRev: site.contentRev })

async function ownerOf(ctx: QueryCtx, slug: string) {
  const actor = await actorFor(ctx, slug)
  if (actor.role === 'staff') fail('FORBIDDEN', 'errors.onlyOwnersAdminsManageKeys')
  return actor
}

export function secret(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  return Array.from(bytes, (b) => KEY_ALPHABET[b % KEY_ALPHABET.length]).join('')
}

async function allEntries(ctx: QueryCtx, site: Id<'sites'>): Promise<Entry[]> {
  return ctx.db.query('entries').withIndex('by_site_brick_order', (q) => q.eq('site', site)).collect()
}

/** The entry a single brick starts with: its defaults, prints, trees, budget bytes and one revision per field (SPEC 5.2 step 7). */
interface NewSingle {
  brick: string
  data: Record<string, Json>
  prints: Prints
  fields: Fields
  trees: { json: string; bytes: number }
  bytes: number
}

async function newSingle(brick: string, fields: Fields, main: Locale): Promise<NewSingle> {
  const data = defaultsFor(fields)
  const prints = nextPrints({ fields, roots: Object.keys(data), before: {}, after: data, prints: {}, main, confirm: undefined })
  return { brick, data, prints, fields, trees: await treesOf(fields, data), bytes: entryBytes(data, prints) }
}

/** Stores a new single. The release and devPush share this write. */
async function insertSingle(ctx: MutationCtx, site: Id<'sites'>, single: NewSingle, locales: Schema['locales']) {
  const fieldRevs = Object.fromEntries(Object.keys(single.fields).map((name) => [name, 1]))
  const id = await ctx.db.insert('entries', {
    site, brick: single.brick, kind: 'single', order: 0, data: single.data, rev: 1, fieldRevs, lifeRev: 1,
    prints: single.prints, bytes: single.bytes, treeBytes: single.trees.bytes, contentAt: Date.now(),
  })
  await putTrees(ctx, site, id, single.trees.json)
  await syncEntryRefs(ctx, site, id, await entryUses(ctx, single.fields, single.data, locales))
}

async function insertPushKey(ctx: MutationCtx, site: Doc<'sites'>, input: { label: string; scopes: ('release' | 'pull' | 'check' | 'export')[]; createdBy: string }) {
  const label = input.label.trim()
  if (label.length < 1 || label.length > 60) fail('INVALID', 'errors.nameLength1To60')
  const scopes = [...new Set(input.scopes)]
  if (scopes.length === 0) fail('INVALID', 'errors.keyNeedsScope')
  const key = `ginko_${site.slug}_${secret()}`
  const id = await ctx.db.insert('pushKeys', { site: site._id, hash: sha256(key), label, scopes, createdBy: input.createdBy })
  return { id, key }
}

/** Owner or admin creates a push key; the plaintext is returned once and only its SHA-256 is stored (SPEC 10). */
export const createPushKey = mutation({
  args: { site: v.string(), label: v.string(), scopes: v.array(scope) },
  handler: async (ctx, args) => {
    const actor = await ownerOf(ctx, args.site)
    return insertPushKey(ctx, actor.site, { label: args.label, scopes: args.scopes, createdBy: actor.user.id })
  },
})

/** The CI key of a new deployment's first site, next to sites:bootstrap. Internal: deploy or admin key only. */
export const bootstrapKey = internalMutation({
  args: { site: v.string(), label: v.string(), scopes: v.array(scope) },
  handler: async (ctx, args) => {
    const site = await ctx.db.query('sites').withIndex('by_slug', (q) => q.eq('slug', args.site)).unique()
    if (!site) fail('SITE_NOT_FOUND', 'errors.siteMissing')
    return insertPushKey(ctx, site, { label: args.label, scopes: args.scopes, createdBy: 'bootstrap' })
  },
})

/**
 * The push keys of a site, for operators (`npx convex run release:pushKeys '{"site":"linde"}'`): to find a
 * leaked key by its label and revoke it with `release:revokePushKeyAsOperator`. Never the key or its hash.
 */
export const pushKeys = internalQuery({
  args: { site: v.string() },
  handler: async (ctx, args) => {
    const site = await ctx.db.query('sites').withIndex('by_slug', (q) => q.eq('slug', args.site)).unique()
    if (!site) fail('SITE_NOT_FOUND', 'errors.siteMissing')
    const rows = await ctx.db.query('pushKeys').withIndex('by_site', (q) => q.eq('site', site._id)).collect()
    return rows.map((r) => ({ id: r._id, label: r.label, scopes: r.scopes, createdBy: r.createdBy, createdAt: r._creationTime, lastUsedAt: r.lastUsedAt ?? null, revokedAt: r.revokedAt ?? null }))
  },
})

/** `revokePushKey` for operators, who have a deploy key but no session. */
export const revokePushKeyAsOperator = internalMutation({
  args: { key: v.id('pushKeys') },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.key)
    if (!row) fail('NOT_FOUND', 'errors.keyNotFound')
    if (!row.revokedAt) await ctx.db.patch(row._id, { revokedAt: Date.now() })
    return { id: row._id }
  },
})

/** Owner or admin revokes a push key of the site. Revoking twice changes nothing. */
export const revokePushKey = mutation({
  args: { site: v.string(), key: v.string() },
  handler: async (ctx, args) => {
    const actor = await ownerOf(ctx, args.site)
    const id = ctx.db.normalizeId('pushKeys', args.key)
    const row = id ? await ctx.db.get(id) : null
    if (!row || row.site !== actor.site._id) fail('NOT_FOUND', 'errors.keyNotFound')
    if (!row.revokedAt) await ctx.db.patch(row._id, { revokedAt: Date.now() })
    return { id: row._id }
  },
})

/** The HTTP layer looks a key up by its hash. Revocation and scope are checked there. */
export const pushKey = internalQuery({
  args: { hash: v.string() },
  handler: async (ctx, args) => {
    const key = await ctx.db.query('pushKeys').withIndex('by_hash', (q) => q.eq('hash', args.hash)).unique()
    if (!key) return null
    const site = await ctx.db.get(key.site)
    if (!site || site.deleting) return null
    return { keyId: key._id, site: key.site, siteSlug: site.slug, scopes: key.scopes, revokedAt: key.revokedAt ?? null, lastUsedAt: key.lastUsedAt ?? null }
  },
})

/** Stamps when a push key was last used. Called at most once an hour per key, so CI runs add almost no writes. */
export const touchPushKey = internalMutation({
  args: { key: v.id('pushKeys') },
  handler: async (ctx, { key }) => {
    await ctx.db.patch(key, { lastUsedAt: Date.now() })
  },
})

/** SPEC 5.1 step 2: schema, revisions, applied migrations and the data of every entry, deleted ones too. */
export const state = internalQuery({
  args: { site: v.id('sites') },
  handler: async (ctx, args) => {
    const site = await ctx.db.get(args.site)
    if (!site) fail('SITE_NOT_FOUND', 'errors.siteNotFound')
    const migrations = await ctx.db.query('migrationsApplied').withIndex('by_site_id', (q) => q.eq('site', args.site)).collect()
    const entries = await allEntries(ctx, args.site)
    return {
      site: site.slug,
      schema: site.schema as Json,
      schemaRev: site.schemaRev,
      contentRev: site.contentRev,
      migrations: migrations.map((m) => ({ id: m.id, brick: m.brick, fills: m.fills, fingerprint: m.fingerprint, schemaRev: m.schemaRev })),
      entries: entries.map((e) => ({ id: e._id, brick: e.brick, kind: e.kind, order: e.order, data: e.data as Json, deletedAt: e.deletedAt ?? null })),
    }
  },
})

/**
 * SPEC 5.2: one transaction that checks the candidate schema and the migration writes of the
 * CLI, then stores the schema and every changed entry. Steps are numbered as in the spec.
 */
export const release = internalMutation({
  args: {
    site: v.id('sites'),
    /** Who sends it, for the change row, e.g. `pushkey:<id>`. */
    actor: v.string(),
    commit: v.string(),
    expectedSchemaRev: v.number(),
    expectedContentRev: v.number(),
    schema: v.any(),
    writes: v.array(v.object({ entry: v.string(), fields: v.record(v.string(), v.any()) })),
  },
  handler: async (ctx, args): Promise<Json> => {
    const site = await ctx.db.get(args.site)
    if (!site) fail('SITE_NOT_FOUND', 'errors.siteNotFound')

    // 1. The same commit again: the stored answer, nothing changes.
    if (site.release?.commit === args.commit) return { schemaRev: site.release.schemaRev, contentRev: site.release.contentRev }

    // 2.
    checkRev(args.expectedSchemaRev)
    checkRev(args.expectedContentRev)
    if (args.expectedSchemaRev !== site.schemaRev) fail('CHANGED_SINCE', 'errors.schemaChangedMeanwhileRetry', undefined, current(site))
    if (args.writes.length > RELEASE_LIMITS.writes || byteSize(args) > RELEASE_LIMITS.argBytes) fail('RELEASE_TOO_LARGE', 'errors.releaseTooLarge')

    const stored = site.schema as Schema
    const next = args.schema as Schema
    const problems = checkSchema(next)
    if (problems.length) fail('INVALID', 'errors.schemaInvalid', undefined, { problems: problems as unknown as Json })
    // The key names the site; its config may not speak for another one. (checkSchema already requires an
    // http(s) URL: it is where "Update website now" sends the site's refresh token.)
    if (next.site !== site.slug) fail('INVALID', 'errors.siteNameMismatchInSchema')
    // The release may move the site to a new address, but only to one the platform may call (no internal hosts).
    if (next.url !== site.url && !isFetchableSiteUrl(next.url, process.env.GINKO_LOCAL === '1')) fail('INVALID', 'errors.siteUrlNotAllowed')

    // 3. Migration changes are reported first: they name the exact fix (new ID). The ledger of
    // applied migrations is the permanent identity: the schema forgets a migration once it is
    // dropped from the config, the ledger does not (SPEC 2.6). One row per ID, never a second one.
    const ledger = await ctx.db.query('migrationsApplied').withIndex('by_site_id', (q) => q.eq('site', args.site)).collect()
    const applied = new Map<string, MigrationDescriptor>()
    for (const m of [...stored.migrations, ...ledger]) applied.set(m.id, { id: m.id, brick: m.brick, fills: m.fills, fingerprint: m.fingerprint })
    const { rejected } = diffSchema({ ...stored, migrations: [...applied.values()] }, next)
    const changedMigrations = rejected.filter((r) => r.kind === 'migrationChanged')
    if (changedMigrations.length) fail('MIGRATION_CHANGED', 'errors.knownMigrationChanged', undefined, { rejected: changedMigrations as unknown as Json })
    if (rejected.length) fail('SCHEMA_REJECTED', 'errors.schemaBreaksChangeRules', undefined, { rejected: rejected as unknown as Json })

    // 4. Applied IDs with the same descriptor are done; the diff above rejects any other known ID.
    const fresh = next.migrations.filter((m) => !applied.has(m.id))
    const main = next.locales[0]!
    for (const m of fresh) {
      if (next.bricks[m.brick]?.fields[m.fills]?.type === 'slug') fail('INVALID', 'errors.migrationCannotSetSlug', { id: m.id })
    }

    // 5. New migrations or writes need the content the CLI planned against.
    if ((fresh.length > 0 || args.writes.length > 0) && args.expectedContentRev !== site.contentRev) {
      fail('CHANGED_SINCE', 'errors.contentChangedMeanwhileRetry', undefined, current(site))
    }

    const entries = await allEntries(ctx, args.site)
    const byId = new Map(entries.map((e) => [e._id, e]))

    // 6. Completeness: each new migration writes its field once for every entry of its brick, deleted ones too.
    const fillsOf = new Map<string, Set<string>>()
    for (const m of fresh) fillsOf.set(m.brick, (fillsOf.get(m.brick) ?? new Set<string>()).add(m.fills))
    const writesOf = new Map<Id<'entries'>, Record<string, Json>>()
    for (const w of args.writes) {
      const id = ctx.db.normalizeId('entries', w.entry)
      const entry = id ? byId.get(id) : undefined
      if (!id || !entry) fail('NOT_FOUND', 'errors.writeEntryNotFound', undefined, { entry: w.entry })
      const allowed = fillsOf.get(entry.brick) ?? new Set<string>()
      const got = writesOf.get(id) ?? {}
      for (const [field, value] of Object.entries(w.fields)) {
        if (!allowed.has(field) || Object.hasOwn(got, field)) {
          fail('MIGRATION_INCOMPLETE', 'errors.writesDoNotFitMigrations', undefined, { entry: w.entry, field })
        }
        got[field] = value as Json
      }
      writesOf.set(id, got)
    }
    for (const m of fresh) {
      for (const entry of entries) {
        if (entry.brick === m.brick && !Object.hasOwn(writesOf.get(entry._id) ?? {}, m.fills)) {
          fail('MIGRATION_INCOMPLETE', 'errors.migrationMissingForEntry', { id: m.id }, { migration: m.id, entry: entry._id })
        }
      }
    }

    // 7. Candidate on the server: new required defaults (also new list columns) and writes into every
    // entry, new singles from defaults. Same rules as the CLI's candidate (core releaseData).
    const updates: { entry: Entry; data: Record<string, Json>; prints: Prints; roots: string[]; trees: { json: string; bytes: number }; bytes: number }[] = []
    const checked: { entry: Entry; data: Record<string, Json> }[] = []
    for (const [key, brick] of Object.entries(next.bricks)) {
      if (!Object.hasOwn(stored.bricks, key)) continue
      const all = fieldsChanged(stored, next, key)
      for (const entry of entries.filter((e) => e.brick === key)) {
        const before = entry.data as Record<string, Json>
        const { data, roots } = releaseData(stored.bricks[key]!.fields, brick.fields, before, writesOf.get(entry._id) ?? {})
        const prints = nextPrints({ fields: brick.fields, roots, before, after: data, prints: entry.prints, main, confirm: undefined })
        const changed = roots.filter((r) => !same(data[r], before[r]) || !same(printsOf(prints, r), printsOf(entry.prints, r)))
        // The trash keeps no trees.
        const trees = entry.deletedAt === undefined ? await treesOf(brick.fields, data) : { json: '', bytes: 0 }
        if (changed.length) updates.push({ entry, data, prints, roots: changed, trees, bytes: entryBytes(data, prints) })
        if (changed.length || all) checked.push({ entry, data })
      }
    }

    const created: NewSingle[] = []
    for (const [key, brick] of Object.entries(next.bricks)) {
      if (Object.hasOwn(stored.bricks, key) || brick.kind !== 'single') continue
      created.push(await newSingle(key, brick.fields, main))
    }

    // Every entry of a brick whose fields changed, not only the written ones (break-it 9): a lowered
    // min off the step grid or a migration that returned nothing must not be stored as valid.
    for (const c of checked) {
      const result = await validate(next, c.entry.brick, c.data, { mode: 'release' })
      if (result.errors.length) fail('INVALID', 'errors.entryNoLongerFitsAfterRelease', undefined, { entry: c.entry._id, errors: result.errors as unknown as Json })
    }
    for (const c of created) {
      const result = await validate(next, c.brick, c.data, { mode: 'release' })
      if (result.errors.length) fail('INVALID', 'errors.newSingletonDoesNotFit', { brick: c.brick }, { brick: c.brick, errors: result.errors as unknown as Json })
    }

    // Files: a file that an entry did not reference before must be a ready upload of this site (SPEC 4.3).
    // An image field takes images only, also through a release (break-it 9).
    for (const u of updates) await checkNewFiles(ctx, args.site, next.bricks[u.entry.brick]!.fields, u.entry.data as Data, u.data)
    for (const c of created) await checkNewFiles(ctx, args.site, c.fields, {}, c.data)

    // Links: no live entry may get a new broken link. Checked against the new schema (its pages) with all written entries in place; drafts are not online.
    await checkNewLinks(ctx, { ...site, schema: next }, updates
      .filter((u) => !u.entry.deletedAt && u.entry.state !== 'draft')
      .map((u) => ({ entry: u.entry, fields: next.bricks[u.entry.brick]!.fields, before: u.entry.data as Data, after: u.data })))

    // Budget (SPEC 3, 5.2 step 9). Documents are the entries written plus the singles created.
    if (updates.length + created.length > RELEASE_LIMITS.documents) fail('RELEASE_TOO_LARGE', 'errors.releaseTooLarge')
    const updated = new Map(updates.map((u) => [u.entry._id, u]))
    // A written live entry and a created single must fit the entry limit unless they do not grow. An entry the release
    // does not touch is not checked, nor a removed one (the trash counts apart); the error names the entry.
    const tooLarge = [
      ...created.map((c) => ({ after: c.bytes, before: 0, title: labelOf(next, c.brick, c.data), entry: undefined })),
      ...updates.filter((u) => !u.entry.deletedAt).map((u) => ({ after: u.bytes, before: u.entry.bytes, title: labelOf(next, u.entry.brick, u.data), entry: u.entry._id })),
    ].find((e) => !fitsBudget(e.after, e.before, BUDGET.entryBytes))
    if (tooLarge) {
      fail('TOO_LARGE', 'errors.releaseEntryTooLarge', { title: tooLarge.title, used: sizeText(tooLarge.after), limit: sizeText(BUDGET.entryBytes) }, tooLarge.entry ? { entry: tooLarge.entry } : undefined)
    }
    // entryCount and bytes count live entries only (SPEC 4.2 remove); removed ones are in trashBytes.
    const entryCount = entries.filter((e) => !e.deletedAt).length + created.length
    const after = storageSums([
      ...entries.map((e) => { const u = updated.get(e._id); return u ? { deletedAt: e.deletedAt, bytes: u.bytes, treeBytes: u.trees.bytes } : e }),
      ...created.map((c) => ({ bytes: c.bytes, treeBytes: c.trees.bytes })),
    ])
    if (entryCount > BUDGET.entries) fail('TOO_LARGE', 'errors.siteEntryCapReached')
    if (!fitsBudget(after.bytes, site.bytes, BUDGET.siteBytes)) fail('TOO_LARGE', 'errors.siteStorageLimitReached', overBudget(after.bytes, BUDGET.siteBytes))
    if (!fitsBudget(after.treeBytes, site.treeBytes ?? 0, BUDGET.treeBytes)) fail('TOO_LARGE', 'errors.entryTooComplex')

    // 8. Write: schema, entries, orderRevs, migrations, contentRev only when an entry changed, release record, change row.
    const changedContent = updates.length > 0 || created.length > 0
    const schemaRev = site.schemaRev + 1
    const contentRev = changedContent ? site.contentRev + 1 : site.contentRev
    for (const u of updates) {
      const rev = u.entry.rev + 1
      const fieldRevs = { ...u.entry.fieldRevs }
      for (const root of u.roots) fieldRevs[root] = rev
      await ctx.db.patch(u.entry._id, { data: u.data, prints: u.prints, trees: undefined, rev, fieldRevs, bytes: u.bytes, treeBytes: u.trees.bytes })
      await putTrees(ctx, args.site, u.entry._id, u.trees.json)
      await syncEntryRefs(ctx, args.site, u.entry._id, await entryUses(ctx, next.bricks[u.entry.brick]!.fields, u.data, next.locales))
    }

    const orderRevs: Record<string, number> = { ...site.orderRevs }
    for (const key of Object.keys(next.bricks)) orderRevs[key] ??= 0
    for (const c of created) {
      await insertSingle(ctx, args.site, c, next.locales)
      orderRevs[c.brick] = (orderRevs[c.brick] ?? 0) + 1
    }

    for (const m of fresh) {
      await ctx.db.insert('migrationsApplied', { site: args.site, id: m.id, brick: m.brick, fills: m.fills, fingerprint: m.fingerprint, schemaRev })
    }
    const at = Date.now()
    await ctx.db.patch(args.site, {
      schema: next as unknown as Json,
      // The config owns the site's name and URL: "Seite ansehen", invites and the refresh target follow it.
      name: next.name,
      url: next.url,
      schemaRev,
      contentRev,
      orderRevs,
      entryCount,
      ...after,
      release: { commit: args.commit, schemaRev, contentRev, at },
    })
    await ctx.db.insert('changes', {
      site: args.site, brick: '', actor: args.actor, opId: `release:${args.commit}`, kind: 'release',
      ...recorded(msg('history.release', { commit: args.commit.slice(0, 7) })), contentRev, at,
    })
    return { schemaRev, contentRev }
  },
})

/**
 * `pnpm local:dev` (SPEC 5.3): stores the site's schema in the LOCAL platform; rejected changes go
 * through and come back as warnings. Internal, so only `npx convex run` with the deployment's
 * admin key can call it — no sign-in needed locally, unreachable for browsers. A site that does
 * not exist yet is created, so a fresh local backend works without setup. Every non-retired
 * single brick gets its one entry when it has none, so its entry can be saved at once.
 */
export const devPush = internalMutation({
  args: { site: v.string(), schema: v.any() },
  handler: async (ctx, args) => {
    if (process.env.GINKO_LOCAL !== '1') fail('FORBIDDEN', 'errors.devPushLocalOnly')
    const next = args.schema as Schema
    const problems = checkSchema(next)
    if (problems.length) fail('INVALID', 'errors.schemaInvalid', undefined, { problems: problems as unknown as Json })
    if (next.site !== args.site) fail('INVALID', 'errors.siteNameMismatchInSchema')
    const site = await ctx.db.query('sites').withIndex('by_slug', (q) => q.eq('slug', args.site)).unique()
    if (!site) {
      const id = await ctx.db.insert('sites', {
        slug: args.site, name: next.name, url: next.url, previewOrigins: ['http://localhost:3000'], schema: next as unknown as Json,
        schemaRev: 1, contentRev: 1, orderRevs: {}, entryCount: 0, bytes: 0, trashBytes: 0, treeBytes: 0, release: null,
      })
      await createMissingSingles(ctx, (await ctx.db.get(id))!, next)
      return { schemaRev: 1, changes: [], warnings: [] }
    }
    const stored = site.schema as Schema
    const { changes, rejected } = diffSchema(stored, next)
    const changed = stableJson(next as unknown as Json) !== stableJson(stored as unknown as Json)
    const schemaRev = changed ? site.schemaRev + 1 : site.schemaRev
    if (changed) await ctx.db.patch(site._id, { schema: next as unknown as Json, name: next.name, url: next.url, schemaRev })
    await createMissingSingles(ctx, site, next)
    return { schemaRev, changes: changes as unknown as Json, warnings: rejected as unknown as Json }
  },
})

/** devPush: the missing single entries, with the site's counters kept exact (entryCount, the byte sums, orderRevs). */
async function createMissingSingles(ctx: MutationCtx, site: Doc<'sites'>, schema: Schema) {
  const entries = await allEntries(ctx, site._id)
  const filled = new Set(entries.map((e) => e.brick))
  const main = schema.locales[0]!
  const created: NewSingle[] = []
  for (const [key, brick] of Object.entries(schema.bricks)) {
    if (brick.kind === 'single' && !brick.retired && !filled.has(key)) created.push(await newSingle(key, brick.fields, main))
  }

  const orderRevs: Record<string, number> = { ...site.orderRevs }
  for (const key of Object.keys(schema.bricks)) orderRevs[key] ??= 0
  for (const single of created) {
    await insertSingle(ctx, site._id, single, schema.locales)
    orderRevs[single.brick] = (orderRevs[single.brick] ?? 0) + 1
  }
  await ctx.db.patch(site._id, {
    orderRevs,
    entryCount: entries.filter((e) => !e.deletedAt).length + created.length,
    ...storageSums([...entries, ...created.map((c) => ({ bytes: c.bytes, treeBytes: c.trees.bytes }))]),
  })
}

function printsOf(prints: Prints, root: string) {
  return Object.fromEntries(Object.entries(prints).filter(([leaf]) => leaf === root || leaf.startsWith(`${root}.`)))
}
