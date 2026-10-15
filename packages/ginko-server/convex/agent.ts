// The agent door (SPEC 16): a person's keys, and the tools behind POST /mcp (routes/mcp.ts).
// A key acts as its person with their role and grants at call time. Every write runs through the
// same operations as the platform (`saveAs`, `createAs`, ...), so rights, checks and history are one.
import type { Json } from '@lupinum/ginko'
import { labelOf as labelIn, checkLinks, fromToolInput, isSafeHref, isTranslatable, sha256, taskInputSchema, type JsonSchemaObject, type Schema } from '@lupinum/ginko/internal'
import { v } from 'convex/values'
import type { Doc, Id } from './_generated/dataModel'
import { bundleOf } from './bundle'
import { internalMutation, internalQuery, mutation, query, type MutationCtx, type QueryCtx } from './_generated/server'
import { createAs, labelOf, removeAs, revertAs, saveAs, undoAs, usesOfEntry, versionAtAs } from './entries'
import { usageAs } from './files'
import { ownAs } from './proposals'
import { actorFor, entryOf, fail, idempotent, memberOf, type Actor } from './lib/access'
import { searchEntries as searchAll, searchTexts } from './lib/search'
import { fixedTools, HISTORY_MAX, PROPOSE, REQUEST_ID, SEARCH_MAX, linksIn, taskFor, taskHints, taskTools, describeTask, draftBricks, type TaskTool, type ToolDef } from './lib/agentTools'
import type { Data } from './lib/content'
import { leafStatus } from './lib/translation'
import { historyText, type HistoryMsg } from './lib/history'
import { same } from './lib/write'
import { effectiveReview } from './lib/policy'
import { secret } from './release'
import { prefillAs } from './tasks'

/** SPEC 16: 60 calls per minute and key. */
export const AGENT_RATE_LIMIT = 60
const KEYS_PER_PERSON = 10
const PROPOSAL_STATUS = ['open', 'scheduled', 'applied', 'rejected', 'stale', 'withdrawn']

// ---- Keys: created, listed and revoked by the person in the platform ("Mit KI verbinden"). ----

/** A new key for the signed-in person on this site. The plaintext is returned once; only its SHA-256 is stored. */
export const createKey = mutation({
  args: { site: v.string(), label: v.string() },
  handler: async (ctx, args) => {
    const actor = await actorFor(ctx, args.site)
    const label = args.label.trim()
    if (label.length < 1 || label.length > 60) fail('INVALID', 'errors.nameLength1To60')
    const own = await ctx.db.query('agentKeys').withIndex('by_site_user', (q) => q.eq('site', actor.site._id).eq('user', actor.user.id)).collect()
    if (own.filter((k) => !k.revokedAt).length >= KEYS_PER_PERSON) fail('INVALID', 'errors.keyLimitReached', { keysPerPerson: KEYS_PER_PERSON })
    const key = `ginko_agent_${secret()}`
    const id = await ctx.db.insert('agentKeys', { site: actor.site._id, user: actor.user.id, hash: sha256(key), label, createdAt: Date.now() })
    return { id, key }
  },
})

/** The signed-in person's keys on this site, newest first. Never the hash. */
export const keys = query({
  args: { site: v.string() },
  handler: async (ctx, args) => {
    const actor = await actorFor(ctx, args.site)
    const rows = await ctx.db.query('agentKeys').withIndex('by_site_user', (q) => q.eq('site', actor.site._id).eq('user', actor.user.id)).order('desc').collect()
    return rows.map((k) => ({
      id: k._id, label: k.label, createdAt: k.createdAt, lastUsedAt: k.lastUsedAt ?? null, revokedAt: k.revokedAt ?? null,
      /** The key's own setting (null: the site decides) and what that makes of it now (SPEC 17). */
      review: k.review ?? null, reviewEffective: effectiveReview(k, actor.site),
    }))
  },
})

/** Revokes a key: the person's own, or any key of the site for owners and admins. Twice changes nothing. */
export const revokeKey = mutation({
  args: { site: v.string(), key: v.string() },
  handler: async (ctx, args) => {
    const actor = await actorFor(ctx, args.site)
    const id = ctx.db.normalizeId('agentKeys', args.key)
    const row = id ? await ctx.db.get(id) : null
    if (!row || row.site !== actor.site._id || (row.user !== actor.user.id && actor.role === 'staff')) fail('NOT_FOUND', 'errors.keyNotFound')
    if (!row.revokedAt) await ctx.db.patch(row._id, { revokedAt: Date.now() })
    return { id: row._id }
  },
})

/**
 * Sets whether this key's writes are proposals (SPEC 17); `null` hands the decision back to the site.
 * The key's person and owners/admins may switch it on. Only owners and admins may switch it off or
 * clear it: otherwise staff could lift the site's review for their own key.
 */
export const setKeyReview = mutation({
  args: { site: v.string(), key: v.string(), review: v.union(v.boolean(), v.null()) },
  handler: async (ctx, args) => {
    const actor = await actorFor(ctx, args.site)
    const id = ctx.db.normalizeId('agentKeys', args.key)
    const row = id ? await ctx.db.get(id) : null
    const approver = actor.role !== 'staff'
    if (!row || row.site !== actor.site._id || (row.user !== actor.user.id && !approver)) fail('NOT_FOUND', 'errors.keyNotFound')
    if (args.review !== true && !approver) fail('FORBIDDEN', 'errors.onlyOwnersCanDisableReview')
    await ctx.db.patch(row._id, { review: args.review ?? undefined })
    return { id: row._id, review: args.review, reviewEffective: effectiveReview({ review: args.review ?? undefined }, actor.site) }
  },
})

// ---- The door: key → actor, rate limit, tools, calls. Internal: only routes/mcp.ts calls these. ----

/** The person behind a key, with their role and grants now; null when revoked or no longer a member. */
async function agentActor(ctx: QueryCtx, keyId: Id<'agentKeys'>): Promise<Actor | null> {
  const key = await ctx.db.get(keyId)
  if (!key || key.revokedAt) return null
  const site = await ctx.db.get(key.site)
  const actor = site && await memberOf(ctx, site, { id: key.user })
  return actor ? { ...actor, agentKey: key._id } : null
}

async function actorOrFail(ctx: QueryCtx, keyId: Id<'agentKeys'>): Promise<Actor> {
  const actor = await agentActor(ctx, keyId)
  // The HTTP layer admitted the key a moment ago; this covers a revocation in between.
  if (!actor) fail('FORBIDDEN', 'errors.keyNoLongerValid')
  return actor
}

/** First step of every request: the key must be live and its person a member; counts the call for the rate limit. */
export const admit = internalMutation({
  args: { hash: v.string() },
  handler: async (ctx, { hash }): Promise<{ ok: true; key: Id<'agentKeys'> } | { ok: false; code: 'UNAUTHORIZED' | 'RATE_LIMITED' }> => {
    const key = await ctx.db.query('agentKeys').withIndex('by_hash', (q) => q.eq('hash', hash)).unique()
    if (!key || !(await agentActor(ctx, key._id))) return { ok: false, code: 'UNAUTHORIZED' }
    const now = Date.now()
    const minute = Math.floor(now / 60_000)
    const calls = key.minute === minute ? (key.calls ?? 0) : 0
    if (calls >= AGENT_RATE_LIMIT) return { ok: false, code: 'RATE_LIMITED' }
    await ctx.db.patch(key._id, { minute, calls: calls + 1, lastUsedAt: now })
    return { ok: true, key: key._id }
  },
})

async function inputSchemaOf(ctx: QueryCtx, actor: Actor, tool: TaskTool): Promise<JsonSchemaObject> {
  const schema = actor.site.schema as Schema
  const prefill = await prefillAs(ctx, actor, { site: actor.site.slug, task: tool.ref }) as Record<string, Json>
  return taskInputSchema(schema.bricks[tool.brick]!, tool.task, { mainLocale: schema.locales[0]!, currency: schema.currency, prefill })
}

/** tools/list: the fixed tools and one tool per task the person may run; every task tool may carry `propose` and `request_id`. */
export const tools = internalQuery({
  args: { key: v.id('agentKeys') },
  handler: async (ctx, { key }) => {
    const actor = await actorOrFail(ctx, key)
    const schema = actor.site.schema as Schema
    const out: ToolDef[] = fixedTools(actor)
    for (const tool of taskTools(actor)) {
      const input = await inputSchemaOf(ctx, actor, tool)
      out.push({
        name: tool.name, description: describeTask(schema.bricks[tool.brick]!, tool.task, schema.locales[0]!),
        inputSchema: { ...input, properties: { ...input.properties, propose: PROPOSE, request_id: REQUEST_ID } } as unknown as Json, annotations: taskHints(tool.task),
      })
    }
    return out
  },
})

/** ginko_overview, plus the site slug the HTTP layer needs for ginko_read. */
export const overview = internalQuery({
  args: { key: v.id('agentKeys') },
  handler: async (ctx, { key }) => {
    const actor = await actorOrFail(ctx, key)
    const schema = actor.site.schema as Schema
    const allowed = taskTools(actor)
    const review = effectiveReview(await ctx.db.get(key), actor.site)
    const drafts = draftBricks(actor)
    return {
      site: actor.site.slug,
      name: actor.site.name,
      url: schema.url,
      locales: schema.locales,
      role: actor.role,
      /** True: changes through this key wait for approval (SPEC 17). */
      review,
      ...(review ? { hint: 'Changes made with this key wait for approval.' } : {}),
      bricks: Object.entries(schema.bricks).filter(([, b]) => !b.retired).map(([brick, b]) => ({
        brick, label: labelIn(b.label, schema.locales[0]!, schema.locales[0]!), kind: b.kind, ...(drafts.includes(brick) ? { drafts: true } : {}),
        tasks: allowed.filter((t) => t.brick === brick).map((t) => ({ tool: t.name, label: labelIn(t.task.label, schema.locales[0]!, schema.locales[0]!) })),
      })),
    }
  },
})

/** What the assistant is told when its call became a proposal (SPEC 17): nothing is live yet, and there is nothing to undo. */
const PROPOSED = 'Proposed, waiting for approval.'

/**
 * A history line for the model: the catalog message in English, whatever the language of the person;
 * rows written before `msg` only have the German `sentence`.
 */
const lineFor = (row: { msg?: unknown; sentence: string }, schema: Schema): string =>
  row.msg ? historyText(row.msg as HistoryMsg, 'en', schema) : row.sentence
const proposed = (result: Json): boolean => typeof result === 'object' && result !== null && !Array.isArray(result) && 'proposal' in result

const UNDOABLE = new Set(['save', 'create'])

/** ginko_history: the latest changes with their sentence (English); `undoable` when ginko_undo can take it back. */
export const history = internalQuery({
  args: { key: v.id('agentKeys'), limit: v.optional(v.number()) },
  handler: async (ctx, { key, limit }) => {
    const actor = await actorOrFail(ctx, key)
    const schema = actor.site.schema as Schema
    const n = Math.min(Math.max(Math.floor(limit ?? 20), 1), HISTORY_MAX)
    const rows = await ctx.db.query('changes').withIndex('by_site_at', (q) => q.eq('site', actor.site._id)).order('desc').take(n)
    return rows.map((c) => ({
      change: c._id, at: new Date(c.at).toISOString(), sentence: lineFor(c, schema), kind: c.kind,
      ...(c.via ? { via: c.via } : {}), undoable: UNDOABLE.has(c.kind) && !c.undoneBy,
    }))
  },
})

/** The entry a task changes: the picked one, or the single entry of a single brick. */
async function targetOf(ctx: MutationCtx, actor: Actor, brick: string, picked: Json | undefined): Promise<Doc<'entries'>> {
  if (picked !== undefined) {
    if (typeof picked !== 'string') fail('INVALID', 'errors.entryIdMissing')
    const entry = await entryOf(ctx, actor, picked)
    if (entry.brick !== brick) fail('NOT_FOUND', 'errors.entryNotFound')
    return entry
  }
  const entry = await ctx.db.query('entries').withIndex('by_site_brick_order', (q) => q.eq('site', actor.site._id).eq('brick', brick)).first()
  if (!entry || entry.kind !== 'single') fail('INVALID', 'errors.entryIdMissing')
  return entry
}

/** The newest change row of an entry: the one the operation just wrote. */
function lastChangeOf(ctx: QueryCtx, entry: Id<'entries'>) {
  return ctx.db.query('changes').withIndex('by_entry', (q) => q.eq('entry', entry)).order('desc').first()
}

function newRowId(): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  return Array.from(crypto.getRandomValues(new Uint8Array(10)), (b) => alphabet[b % alphabet.length]).join('')
}

// ---- Tools that only read: search, an old version, a file's uses, the link check, the caller's proposals. ----

const text = (value: Json | undefined, what: string): string => {
  if (typeof value !== 'string' || !value.trim()) fail('INVALID', 'errors.fieldMissing', { what })
  return value
}

/** ginko_search: the shared search (lib/search.ts). Drafts are found too and marked. */
async function searchEntries(ctx: QueryCtx, actor: Actor, input: Record<string, Json>) {
  const query = text(input.query, 'query')
  const brick = typeof input.brick === 'string' ? input.brick : undefined
  const limit = Math.min(Math.max(Math.floor(typeof input.limit === 'number' ? input.limit : 10), 1), SEARCH_MAX)
  const hits = await searchAll(ctx, actor, { query, brick, limit })
  return hits.map((hit) => ({ entry: hit.entry, brick: hit.brick, label: hit.label, snippet: hit.snippet, ...(hit.state === 'live' ? {} : { draft: true }) }))
}

/** ginko_check_links: the core link checker over the current content in every language, plus a scan for unsafe link targets. */
async function checkSiteLinks(ctx: QueryCtx, actor: Actor, input: Record<string, Json>) {
  const schema = actor.site.schema as Schema
  const only = typeof input.brick === 'string' ? input.brick : undefined
  if (only !== undefined && !Object.hasOwn(schema.bricks, only)) fail('INVALID', 'errors.brickNotFoundSeeOverview', { only })
  const bundles = await Promise.all(schema.locales.map((locale) => bundleOf(ctx, actor.site, locale)))
  // The platform knows no files of the site's public folder, so a path that matches no entry or page is reported.
  const issues = checkLinks(bundles, schema, { files: () => false })
  const out = new Map<string, { entry: string | null; brick: string; label: string; field: string; link: string; reason: string; severity: string; locales: string[] }>()
  const labels = new Map<string, { entry: string | null; label: string }>()
  const entryOfIssue = async (brick: string, id: string | undefined) => {
    const known = labels.get(`${brick}\n${id}`)
    if (known) return known
    // A single brick has no entry ID in the bundle: its one entry is the first of the brick.
    const key = id ? ctx.db.normalizeId('entries', id) : null
    const row = key ? await ctx.db.get(key) : await ctx.db.query('entries').withIndex('by_site_brick_order', (q) => q.eq('site', actor.site._id).eq('brick', brick)).first()
    const value = { entry: row?._id ?? null, label: row ? labelOf(schema, brick, row.data as Data) : brick }
    labels.set(`${brick}\n${id}`, value)
    return value
  }
  const add = async (brick: string, id: string | undefined, field: string, link: string, reason: string, severity: string, locale: string) => {
    const at = await entryOfIssue(brick, id)
    const key = `${at.entry}\n${field}\n${link}\n${reason}`
    const seen = out.get(key)
    if (seen) { if (!seen.locales.includes(locale)) seen.locales.push(locale) } else out.set(key, { ...at, brick, field, link, reason, severity, locales: [locale] })
  }
  for (const issue of issues) await add(issue.brick, issue.id, issue.field, issue.href, issue.message, issue.severity, issue.locale)
  for (const [key, def] of Object.entries(schema.bricks)) {
    if (def.retired) continue
    const rows = await ctx.db.query('entries').withIndex('by_site_brick_order', (q) => q.eq('site', actor.site._id).eq('brick', key)).collect()
    for (const row of rows) {
      if (row.deletedAt) continue
      for (const [name, field] of Object.entries(def.fields)) {
        if (field.type !== 'markdown' || field.retired) continue
        for (const markdown of searchTexts(field, (row.data as Data)[name])) {
          for (const href of linksIn(markdown)) if (!isSafeHref(href)) await add(key, row._id, name, href, `Unsafe link: ${href.split(':')[0]}: is not allowed.`, 'error', schema.locales[0]!)
        }
      }
    }
  }
  return [...out.values()].filter((i) => !only || i.brick === only)
}

/** The lookup tools of the door: one query, so the HTTP layer needs a single call. Each runs with the person's rights. */
export const lookup = internalQuery({
  args: { key: v.id('agentKeys'), name: v.string(), args: v.record(v.string(), v.any()) },
  handler: async (ctx, { key, name, args }): Promise<{ text: string; result: Json }> => {
    const actor = await actorOrFail(ctx, key)
    const input = args as Record<string, Json>
    switch (name) {
      case 'ginko_search': {
        const hits = await searchEntries(ctx, actor, input)
        return { text: hits.length ? `${hits.length} hits.` : 'Nothing found.', result: hits }
      }
      case 'ginko_version_at': {
        const version = await versionAtAs(ctx, actor, { entry: text(input.entry, 'entry'), change: text(input.change, 'change') })
        return { text: 'This is how the entry looked after that change.', result: { ...version, diff: version.diff as unknown as Json } }
      }
      case 'ginko_file_usage': {
        const usage = await usageAs(ctx, actor, text(input.file, 'file'))
        const used = usage.usedIn.map((u) => ({ entry: u.entry, brick: u.brick, label: u.title, paths: u.paths, missingAlt: u.missingAlt, ...(u.deleted ? { deleted: true } : {}) }))
        return { text: used.length ? `The file “${usage.name}” is used in ${used.length} entries.` : `The file “${usage.name}” is not used anywhere.`, result: { file: usage.file, name: usage.name, usedIn: used } }
      }
      case 'ginko_check_links': {
        const links = await checkSiteLinks(ctx, actor, input)
        return { text: links.length ? `${links.length} link problems.` : 'No broken or unsafe links found.', result: links }
      }
      case 'ginko_proposals': {
        const wanted = typeof input.status === 'string' ? input.status : undefined
        if (wanted !== undefined && !PROPOSAL_STATUS.includes(wanted)) fail('INVALID', 'errors.unknownState', { wanted })
        const rows = await ownAs(ctx, actor, wanted as Doc<'proposals'>['status'] | undefined)
        const schema = actor.site.schema as Schema
        const mine = rows.map((p) => ({
          proposal: p.proposal, status: p.status, sentence: lineFor(p, schema), op: p.op, brick: p.brick, entry: p.entry, via: p.via,
          createdAt: new Date(p.createdAt).toISOString(), reason: p.reason, change: p.change,
        }))
        const waiting = mine.filter((p) => p.status === 'open' || p.status === 'scheduled').length
        return { text: waiting ? `${waiting} proposals wait for approval.` : 'Nothing waits for approval.', result: mine }
      }
    }
    fail('FORBIDDEN', 'errors.toolNotFoundOrNotYours', { name })
  },
})

/**
 * ginko_read in another language: the outdated translations per entry, which the bundle delivers as they are (D6).
 * Only the entries the bundle holds: not removed, not drafts, not left out of this language.
 */
export const stale = internalQuery({
  args: { key: v.id('agentKeys'), brick: v.string(), locale: v.string() },
  handler: async (ctx, { key, brick, locale }): Promise<Record<string, string[]>> => {
    const actor = await actorOrFail(ctx, key)
    const schema = actor.site.schema as Schema
    const out: Record<string, string[]> = {}
    if (!Object.hasOwn(schema.bricks, brick)) return out
    const rows = await ctx.db.query('entries').withIndex('by_site_brick_deleted', (q) => q.eq('site', actor.site._id).eq('brick', brick).eq('deletedAt', undefined)).collect()
    for (const row of rows) {
      if (row.state === 'draft') continue
      const status = leafStatus(schema, brick, row, locale)
      if (status.page !== 'hidden' && status.outdated.length) out[row._id] = status.outdated
    }
    return out
  },
})

/** When a write shows on the website: in about a minute, or from the day of a week planned ahead or a planned price (`liveFrom`). */
const liveText = (liveFrom: string | undefined) => (liveFrom ? `On the website from ${liveFrom}.` : 'Live on the website in about a minute.')

/** The sentence for the person after a save-like write: proposed, unchanged, or done with the change to undo. */
function savedAs(result: Json, label: string): { text: string; result: Json } {
  if (proposed(result)) return { text: PROPOSED, result }
  const { change, liveFrom } = result as { change?: string; liveFrom?: string }
  return {
    text: change ? `Done: ${label}. ${liveText(liveFrom)} To undo: ginko_undo with change ${change}.` : 'Nothing changed: the values were already like this.',
    result,
  }
}

/** The tool arguments as an object of the allowed shape; anything else is the assistant's mistake. */
function objectArg(value: Json | undefined, what: string): Record<string, Json> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) fail('INVALID', 'errors.fieldNotObject', { what })
  return value
}

/**
 * tools/call for every tool that writes. Returns the operation's result and a sentence for the person.
 * JSON-RPC ids restart with every client session, so they cannot identify a retry; the assistant's own `request_id`
 * can. With one, the whole call is an op `mcp-<request_id>`: the same call again returns the first answer and writes
 * nothing, other arguments are OP_REUSED. The operation inside always gets a new op id, as without one.
 */
export const call = internalMutation({
  args: { key: v.id('agentKeys'), name: v.string(), args: v.record(v.string(), v.any()) },
  handler: async (ctx, { key, name, args }): Promise<{ text: string; result: Json }> => {
    const person = await actorOrFail(ctx, key)
    const { request_id: requestId, ...rest } = args as Record<string, Json>
    if (requestId === undefined) return callOnce(ctx, person, name, rest)
    if (typeof requestId !== 'string') fail('INVALID', 'errors.actionIdInvalid')
    // The op hash covers the tool and its arguments, so a retry with other input is OP_REUSED.
    const op = { opId: `mcp-${requestId}`, name, args: rest }
    return idempotent(ctx, person, op, () => callOnce(ctx, person, name, rest))
  },
})

/** One tools/call that writes. `propose: true` makes it a proposal through the policy (`forceProposal`), never a second write path. */
async function callOnce(ctx: MutationCtx, person: Actor, name: string, args: Record<string, Json>): Promise<{ text: string; result: Json }> {
  const { propose: ask, ...input } = args
  if (ask !== undefined && typeof ask !== 'boolean') fail('INVALID', 'errors.proposeTrueFalse')
  const actor: Actor = ask === true ? { ...person, forceProposal: true } : person
  const opId = crypto.randomUUID()

  if (name === 'ginko_undo') return undoThroughDoor(ctx, person, input.change, opId)
  if (name === 'ginko_revert' || name === 'ginko_translate' || name === 'ginko_draft') {
    if (!fixedTools(person).some((t) => t.name === name)) fail('FORBIDDEN', 'errors.toolNotFoundOrNotYours', { name })
    if (name === 'ginko_revert') return revertThroughDoor(ctx, actor, input, opId)
    return name === 'ginko_translate' ? translateThroughDoor(ctx, actor, input, opId) : draftThroughDoor(ctx, actor, input, opId)
  }
  return taskThroughDoor(ctx, actor, name, input, opId)
}

async function taskThroughDoor(ctx: MutationCtx, actor: Actor, name: string, input: Record<string, Json>, opId: string): Promise<{ text: string; result: Json }> {
  const schema = actor.site.schema as Schema
  const site = actor.site.slug
  const tool = taskTools(actor).find((t) => t.name === name)
  if (!tool) fail('FORBIDDEN', 'errors.toolNotFoundOrNotYours', { name })
  const brick = schema.bricks[tool.brick]!
  const offered = await inputSchemaOf(ctx, actor, tool)
  const unknown = Object.keys(input).filter((k) => !Object.hasOwn(offered.properties, k))
  if (unknown.length) fail('INVALID', 'errors.unknownOption', { unknown: unknown.join(', ') })
  const { entry: picked, confirm, ...values } = input
  const main = schema.locales[0]!
  // Prefilled values count when the assistant leaves a field out: the tool offers them as defaults.
  const prefill = await prefillAs(ctx, actor, { site, task: tool.ref }) as Record<string, Json>

  if (tool.task.kind === 'create') {
    const data = { ...prefill, ...fromToolInput(brick.fields, values, { mainLocale: main, currency: schema.currency, newRowId }) }
    const result = await createAs(ctx, actor, { site, opId, task: tool.ref, brick: tool.brick, data })
    if (proposed(result)) return { text: PROPOSED, result }
    const { entry: id, state, liveFrom } = result as { entry: Id<'entries'>; state: 'draft' | 'live'; liveFrom?: string }
    // A collection with drafts makes a draft (SPEC 15); publishing stays with the person in the platform.
    const where = state === 'draft' ? 'Saved as a draft, not on the website yet. The person publishes it in the platform.' : liveText(liveFrom)
    const change = await lastChangeOf(ctx, id)
    return { text: `Done: ${labelIn(tool.task.label, main, main)}. New entry ${id}. ${where} To undo: ginko_undo with change ${change?._id}.`, result: { ...(result as object), change: change?._id ?? null } }
  }

  const entry = await targetOf(ctx, actor, tool.brick, picked)
  if (tool.task.kind === 'remove') {
    if (confirm !== true) fail('INVALID', 'errors.removeNeedsConfirm')
    const result = await removeAs(ctx, actor, { site, opId, task: tool.ref, entry: entry._id, lifeRev: entry.lifeRev })
    if (proposed(result)) return { text: PROPOSED, result }
    // The same warning as the platform's remove dialog: entries that point at it show without it now.
    const uses = await usesOfEntry(ctx, actor, entry)
    const note = uses.length ? ` Note: ${uses.length} ${uses.length === 1 ? 'entry pointed' : 'entries pointed'} at it (${uses.map((u) => `“${u.title}”`).join(', ')}); they now show without it until it is restored.` : ''
    return { text: `Removed. The person can restore it in the platform for 30 days.${note}`, result }
  }

  const taskFields = tool.task.fields
  const stored = entry.data as Record<string, Json>
  // The task opens on the entry as the Studio's sheet does: besides the presets, a planned change whose day has come
  // is the value in effect and its spent plan is cleared (`prefillAs`), so a new value does not hide behind it.
  const opened = await prefillAs(ctx, actor, { site, task: tool.ref, entry: entry._id }) as Record<string, Json>
  const fields = {
    ...Object.fromEntries(Object.entries(opened).filter(([k, value]) => taskFields.includes(k) && (Object.hasOwn(prefill, k) || !same(value, stored[k])))),
    ...fromToolInput(Object.fromEntries(taskFields.map((f) => [f, brick.fields[f]!])), values, { mainLocale: main, currency: schema.currency, stored, newRowId }),
  }
  if (!Object.keys(fields).length) fail('INVALID', 'errors.nothingToChange')
  // The assistant acts on the state it just read, so the current revision is its base.
  return savedAs(await saveAs(ctx, actor, { site, opId, task: tool.ref, entry: entry._id, baseRev: entry.rev, fields, locale: main }), labelIn(tool.task.label, main, main))
}

/** ginko_translate: foreign-language texts through the normal save with `locale`; only whole texts of translatable fields. */
async function translateThroughDoor(ctx: MutationCtx, actor: Actor, input: Record<string, Json>, opId: string): Promise<{ text: string; result: Json }> {
  const schema = actor.site.schema as Schema
  const main = schema.locales[0]!
  const asked = input.locale
  const locale = schema.locales.find((l) => l === asked)
  if (!locale) fail('INVALID', 'errors.languageNotSetUpAvailable', { asked: String(asked), locales: schema.locales.slice(1).join(', ') })
  if (locale === main) fail('INVALID', 'errors.mainLanguageChangeViaTasks', { main })
  const unknown = Object.keys(input).filter((k) => !['entry', 'locale', 'fields', 'confirm'].includes(k))
  if (unknown.length) fail('INVALID', 'errors.unknownOption', { unknown: unknown.join(', ') })
  if (typeof input.entry !== 'string') fail('INVALID', 'errors.entryIdMissing')
  const entry = await entryOf(ctx, actor, input.entry)
  const brick = schema.bricks[entry.brick]
  if (!brick) fail('INVALID', 'errors.brickNoLongerEditable')
  const values = input.fields === undefined ? {} : objectArg(input.fields, 'fields')
  const confirm = input.confirm === undefined ? [] : input.confirm
  if (!Array.isArray(confirm) || confirm.some((c) => typeof c !== 'string')) fail('INVALID', 'errors.confirmMustBeFieldList')
  for (const key of [...Object.keys(values), ...confirm as string[]]) {
    const field = Object.hasOwn(brick.fields, key) ? brick.fields[key] : undefined
    if (!field || field.retired || !isTranslatable(field) || field.type === 'slug') fail('INVALID', 'errors.fieldNotTranslatable', { key }, { field: key })
  }
  if (!Object.keys(values).length && !confirm.length) fail('INVALID', 'errors.nothingToTranslate')
  for (const [key, value] of Object.entries(values)) if (value !== null && typeof value !== 'string') fail('INVALID', 'errors.fieldNeedsText', { key }, { field: key })
  // The text is stored under the target language; `locale` keeps every other language as it is.
  const fields = fromToolInput(brick.fields, values, { mainLocale: locale, currency: schema.currency, stored: entry.data as Record<string, Json>, newRowId })
  const roots = [...new Set([...Object.keys(fields), ...confirm as string[]])]
  const label = `Translation (${locale}): ${roots.map((k) => labelIn(brick.fields[k]!.label, main, main)).join(', ')}`
  const result = await saveAs(ctx, actor, {
    site: actor.site.slug, opId, task: taskFor(actor, entry.brick, 'edit', roots, entry), entry: entry._id, baseRev: entry.rev, fields, locale,
    ...(confirm.length ? { confirm: confirm as string[] } : {}), sentence: label,
  })
  return savedAs(result, label)
}

/** ginko_draft: a new draft in a collection with drafts; never live (the create is a draft, so no review applies). */
async function draftThroughDoor(ctx: MutationCtx, actor: Actor, input: Record<string, Json>, opId: string): Promise<{ text: string; result: Json }> {
  const schema = actor.site.schema as Schema
  const brickKey = input.brick
  if (typeof brickKey !== 'string' || !draftBricks(actor).includes(brickKey)) fail('INVALID', 'errors.brickHasNoDrafts', { brick: String(brickKey) })
  const brick = schema.bricks[brickKey]!
  const values = objectArg(input.fields, 'fields')
  const unknown = Object.keys(values).filter((k) => !Object.hasOwn(brick.fields, k) || brick.fields[k]!.retired || brick.fields[k]!.type === 'slug')
  if (unknown.length) fail('INVALID', 'errors.unknownOption', { unknown: unknown.join(', ') })
  const data = fromToolInput(brick.fields, values, { mainLocale: schema.locales[0]!, currency: schema.currency, newRowId })
  const result = await createAs(ctx, actor, { site: actor.site.slug, opId, task: taskFor(actor, brickKey, 'create'), brick: brickKey, data })
  const { entry: id } = result as { entry: Id<'entries'> }
  const change = await lastChangeOf(ctx, id)
  return {
    text: `Saved as a draft, not on the website yet. New entry ${id}. The person publishes it in the platform. To undo: ginko_undo with change ${change?._id}.`,
    result: { ...(result as object), change: change?._id ?? null },
  }
}

/** ginko_revert: `entries.revert` (a normal save, so rights, review and undo apply). */
async function revertThroughDoor(ctx: MutationCtx, actor: Actor, input: Record<string, Json>, opId: string): Promise<{ text: string; result: Json }> {
  if (typeof input.entry !== 'string' || typeof input.change !== 'string') fail('INVALID', 'errors.entryAndChangeIdRequired')
  // The fields a later change touched are the ones a revert can write: a staff task must cover them.
  const { fields } = await versionAtAs(ctx, actor, { entry: input.entry, change: input.change })
  const entry = await entryOf(ctx, actor, input.entry)
  const result = await revertAs(ctx, actor, { site: actor.site.slug, opId, task: taskFor(actor, entry.brick, 'edit', fields, entry), entry: entry._id, change: input.change })
  return savedAs(result, 'Back to the earlier state')
}

async function undoThroughDoor(ctx: MutationCtx, actor: Actor, raw: Json | undefined, opId: string): Promise<{ text: string; result: Json }> {
  const id = typeof raw === 'string' ? ctx.db.normalizeId('changes', raw) : null
  const change = id ? await ctx.db.get(id) : null
  if (!change || change.site !== actor.site._id) fail('NOT_FOUND', 'errors.changeNotFound')
  const site = actor.site.slug
  // A new entry is taken back by removing it, as the platform's undo button does (SPEC 4.2).
  if (change.kind === 'create' && change.entry) {
    const entry = await entryOf(ctx, actor, change.entry)
    if (entry.deletedAt || entry.rev !== change.entryRev) fail('CHANGED_SINCE', 'errors.entryChangedMeanwhileNoUndo')
    const result = await removeAs(ctx, actor, { site, opId, task: taskFor(actor, change.brick, 'remove'), entry: entry._id, lifeRev: entry.lifeRev })
    if (proposed(result)) return { text: PROPOSED, result }
    // The creation counts as undone, so history no longer offers it.
    const removal = await lastChangeOf(ctx, entry._id)
    if (removal) await ctx.db.patch(change._id, { undoneBy: removal._id })
    return { text: 'Undone: the entry is removed.', result }
  }
  const entry = change.entry ? await ctx.db.get(change.entry) : null
  const result = await undoAs(ctx, actor, { site, opId, task: taskFor(actor, change.brick, 'edit', change.fields ?? [], entry), change: change._id })
  return { text: `Undone: ${lineFor(change, actor.site.schema as Schema)}.`, result }
}
