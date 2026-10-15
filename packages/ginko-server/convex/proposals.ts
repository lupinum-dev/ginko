// Approvals and releases (SPEC 17): "a change that needs a yes". The write operations in
// entries.ts create the proposals (lib/policy.ts); this file decides them. Approving runs the
// same operation again as the author, with the approver named in the change row, so there is one
// write path. A change that no longer fits (revision moved on) becomes `stale` and writes nothing.
import type { Json } from '@lupinum/ginko'
import type { Schema } from '@lupinum/ginko/internal'
import { paginationOptsValidator } from 'convex/server'
import { ConvexError, v } from 'convex/values'
import { internal } from './_generated/api'
import type { Doc, Id } from './_generated/dataModel'
import { internalAction, internalMutation, mutation, query, type MutationCtx, type QueryCtx } from './_generated/server'
import { checkFuture, createAs, publishAs, removeAs, saveAs, unpublishAs } from './entries'
import { currentUser, fail, memberOf, type Actor } from './lib/access'
import { rootOf } from './lib/content'
import { diffFields } from './lib/diff'
import { historyText, msg, type HistoryMsg, type Param } from './lib/history'
import { localeOfUser, t, type MessageKey } from './lib/i18n'
import { queueMail, mailAvailable, siteOrigin } from './mail'
import { labeler, namer, type Labeler } from './lib/names'
import { taskOf } from './lib/policy'

const PAGE_SIZE = 50
/** SPEC 17: a release groups at most this many proposals. */
export const RELEASE_MAX = 50
const REASON_MAX = 300
const NAME_MAX = 80

const status = v.union(v.literal('open'), v.literal('approved'), v.literal('scheduled'), v.literal('applied'), v.literal('rejected'), v.literal('stale'), v.literal('withdrawn'))

// ---- Who may do what ----

/** Approvers are owners and admins. Staff reads and proposes, never decides. */
const isApprover = (actor: Actor) => actor.role !== 'staff'

/** Nobody approves their own proposal, except one made by their own agent key: that is "show me first". */
function requireDecide(actor: Actor, p: Doc<'proposals'>) {
  if (!isApprover(actor)) fail('FORBIDDEN', 'errors.ownersOnly')
  if (p.author === actor.user.id && p.via !== 'agent') fail('FORBIDDEN', 'errors.cannotApproveOwnProposal')
}

/** The signed-in person as a member of the proposal's site. A foreign proposal looks like a missing one. */
async function actorForProposal(ctx: QueryCtx, id: string): Promise<{ actor: Actor; proposal: Doc<'proposals'> }> {
  const user = await currentUser(ctx)
  const key = ctx.db.normalizeId('proposals', id)
  const proposal = key ? await ctx.db.get(key) : null
  const site = proposal ? await ctx.db.get(proposal.site) : null
  const actor = site ? await memberOf(ctx, site, user) : null
  if (!proposal || !actor) fail('NOT_FOUND', 'errors.proposalNotFound')
  return { actor, proposal }
}

async function actorForRelease(ctx: QueryCtx, id: string): Promise<{ actor: Actor; release: Doc<'releases'> }> {
  const user = await currentUser(ctx)
  const key = ctx.db.normalizeId('releases', id)
  const release = key ? await ctx.db.get(key) : null
  const site = release ? await ctx.db.get(release.site) : null
  const actor = site ? await memberOf(ctx, site, user) : null
  if (!release || !actor) fail('NOT_FOUND', 'errors.releaseNotFound')
  return { actor, release }
}

async function siteActor(ctx: QueryCtx, slug: string): Promise<Actor> {
  const user = await currentUser(ctx)
  const site = await ctx.db.query('sites').withIndex('by_slug', (q) => q.eq('slug', slug)).unique()
  const actor = site ? await memberOf(ctx, site, user) : null
  if (!actor) fail('FORBIDDEN', 'errors.noAccess')
  return actor
}

// ---- Applying ----

/** Why a proposal no longer fits: the German text (stored in `reason`, the fallback) and the catalog message (`reasonMsg`) the Studio renders in the reader's language. */
type Stale = { reason: string; msg: HistoryMsg }

const staleBecause = (key: MessageKey, params?: Record<string, Param>): Stale => {
  const message = msg(key, params)
  return { reason: historyText(message, 'de', undefined), msg: message }
}

type Applied = { ok: true; change?: Id<'changes'>; liveFrom?: string } | ({ ok: false } & Stale)

/** A refusal of the operation (`fail`: code, catalog key, params) as the reason: its own text, then the ask to propose again. */
function reasonOf(data: { code?: string; key?: string; params?: Record<string, string | number> }): Stale {
  if (data.code === 'CHANGED_SINCE') return staleBecause('history.staleChanged')
  const why = data.key ? msg(data.key as MessageKey, data.params) : msg('history.staleNoLonger')
  return staleBecause('history.staleRefused', { why })
}

/**
 * Runs the proposal's operation as its author, with `approver` named in the change row. The
 * operations check everything before they write, so a refusal leaves nothing behind: it becomes the
 * reason the proposal is stale. Any other error is a bug and is thrown.
 */
async function applyNow(ctx: MutationCtx, p: Doc<'proposals'>, approver: string): Promise<Applied> {
  const site = await ctx.db.get(p.site)
  if (!site) return { ok: false, ...staleBecause('history.staleSiteGone') }
  const author = await memberOf(ctx, site, { id: p.author })
  if (!author) return { ok: false, ...staleBecause('history.staleAuthorLeft') }
  const actor: Actor = { ...author, approvedBy: approver, ...(p.agentKey ? { agentKey: p.agentKey } : {}) }
  // A new op ID per proposal: a retry of the same apply finds its stored result.
  const { copy, ...stored } = p.args as { copy?: boolean }
  const args = { ...stored, opId: `p-${p._id}` } as never
  try {
    let result: Json
    switch (p.op) {
      case 'save': result = await saveAs(ctx, actor, args); break
      case 'create': result = await createAs(ctx, actor, args, copy ? { copy } : {}); break
      case 'remove': result = await removeAs(ctx, actor, args); break
      case 'publish': result = await publishAs(ctx, actor, args); break
      case 'unpublish': result = await unpublishAs(ctx, actor, args); break
    }
    const data = result as { change?: Id<'changes'>; entry?: Id<'entries'>; liveFrom?: string }
    // Only a save can end without a change (the values were already there); every other operation writes one.
    const entry = data.entry ?? p.entry
    const change = data.change ?? (p.op !== 'save' && entry ? (await ctx.db.query('changes').withIndex('by_entry', (q) => q.eq('entry', entry)).order('desc').first())?._id : undefined)
    return { ok: true, ...(change ? { change } : {}), ...(data.liveFrom ? { liveFrom: data.liveFrom } : {}) }
  } catch (error) {
    if (error instanceof ConvexError && typeof error.data === 'object' && error.data !== null && 'code' in error.data) return { ok: false, ...reasonOf(error.data as { code?: string; key?: string; params?: Record<string, string | number> }) }
    throw error
  }
}

/** What earlier members of the same release already touched, so the check sees conflicts between them. */
type Touched = Map<string, { roots: Set<string>; life: boolean }>

/**
 * Whether the proposal still fits, without writing: the same preconditions the operation checks
 * (SPEC 4.2). Returns the reason (German text and catalog message) when it does not. Used before a
 * release is applied, so a stale member blocks the release without half of it being written.
 */
async function staleReason(ctx: QueryCtx, p: Doc<'proposals'>, touched: Touched = new Map()): Promise<Stale | null> {
  const retry = staleBecause('history.staleChanged')
  const site = await ctx.db.get(p.site)
  if (!site) return staleBecause('history.staleSiteGone')
  if (!(await memberOf(ctx, site, { id: p.author }))) return staleBecause('history.staleAuthorLeft')
  if (!p.entry) return null
  const entry = await ctx.db.get(p.entry)
  if (!entry || entry.site !== p.site) return staleBecause('history.staleEntryGone')
  if (entry.deletedAt) return staleBecause('history.staleEntryDeleted')
  const args = p.args as { baseRev?: number; lifeRev?: number; fields?: Record<string, Json>; confirm?: string[] }
  const seen = touched.get(entry._id)
  if (p.op === 'save') {
    const roots = [...new Set([...Object.keys(args.fields ?? {}), ...(args.confirm ?? []).map(rootOf)])]
    const base = args.baseRev ?? 0
    if (base > entry.rev || roots.some((r) => (entry.fieldRevs[r] ?? 0) > base) || roots.some((r) => seen?.roots.has(r))) return retry
    touched.set(entry._id, { roots: new Set([...(seen?.roots ?? []), ...roots]), life: seen?.life ?? false })
    return null
  }
  if (entry.lifeRev !== args.lifeRev || seen?.life) return retry
  if (p.op === 'publish' && (entry.state ?? 'live') !== 'draft') return staleBecause('history.staleAlreadyLive')
  if (p.op === 'unpublish' && (entry.state ?? 'live') === 'draft' && entry.publishAt === undefined) return staleBecause('history.staleAlreadyDraft')
  touched.set(entry._id, { roots: seen?.roots ?? new Set(), life: true })
  return null
}

/** `running`: the call comes from the proposal's own scheduled job, which has nothing left to cancel. */
async function markStale(ctx: MutationCtx, p: Doc<'proposals'>, why: Stale, by: string, running = false) {
  if (p.job && !running) await ctx.scheduler.cancel(p.job)
  await ctx.db.patch(p._id, { status: 'stale', reason: why.reason, reasonMsg: why.msg, decidedBy: by, decidedAt: Date.now(), job: undefined })
}

async function markApplied(ctx: MutationCtx, p: Doc<'proposals'>, by: string, change: Id<'changes'> | undefined) {
  await ctx.db.patch(p._id, { status: 'applied', decidedBy: by, decidedAt: Date.now(), job: undefined, ...(change ? { change } : {}) })
}

/** Release member status back to open (a scheduled release that could not run). */
async function reopen(ctx: MutationCtx, p: Doc<'proposals'>) {
  await ctx.db.patch(p._id, { status: 'open', at: undefined, decidedBy: undefined, decidedAt: undefined })
}

// ---- Deciding one proposal ----

export const approve = mutation({
  args: { proposal: v.string(), at: v.optional(v.number()) },
  handler: async (ctx, args): Promise<Json> => {
    const { actor, proposal: p } = await actorForProposal(ctx, args.proposal)
    requireDecide(actor, p)
    if (p.status !== 'open') fail('CHANGED_SINCE', 'errors.proposalNoLongerOpen', undefined, { status: p.status })
    if (p.release) fail('INVALID', 'errors.proposalInReleaseApproveRelease')
    const by = actor.user.id

    if (args.at !== undefined) {
      checkFuture(args.at)
      const reason = await staleReason(ctx, p)
      if (reason) {
        await markStale(ctx, p, reason, by)
        return { proposal: p._id, status: 'stale', reason: reason.reason, reasonMsg: reason.msg }
      }
      const job = await ctx.scheduler.runAt(args.at, internal.proposals.applyScheduled, { proposal: p._id, at: args.at })
      await ctx.db.patch(p._id, { status: 'scheduled', at: args.at, job, decidedBy: by, decidedAt: Date.now() })
      return { proposal: p._id, status: 'scheduled', at: args.at }
    }

    const applied = await applyNow(ctx, p, by)
    if (!applied.ok) {
      await markStale(ctx, p, applied, by)
      return { proposal: p._id, status: 'stale', reason: applied.reason, reasonMsg: applied.msg }
    }
    await markApplied(ctx, p, by, applied.change)
    // A week planned ahead or a planned price: the approver is told from when it shows.
    return { proposal: p._id, status: 'applied', change: applied.change ?? null, ...(applied.liveFrom ? { liveFrom: applied.liveFrom } : {}) }
  },
})

/** The run of a scheduled approval: re-checks everything now. A change in between makes the proposal stale. */
export const applyScheduled = internalMutation({
  args: { proposal: v.id('proposals'), at: v.number() },
  handler: async (ctx, args): Promise<null> => {
    const p = await ctx.db.get(args.proposal)
    if (!p || p.status !== 'scheduled' || p.at !== args.at || !p.decidedBy) return null
    const site = await ctx.db.get(p.site)
    const approver = site && await memberOf(ctx, site, { id: p.decidedBy })
    if (!approver || !isApprover(approver) || (p.author === p.decidedBy && p.via !== 'agent')) {
      await markStale(ctx, p, staleBecause('history.staleApproverNotAllowed'), p.decidedBy, true)
      return null
    }
    const applied = await applyNow(ctx, p, p.decidedBy)
    if (applied.ok) {
      await markApplied(ctx, p, p.decidedBy, applied.change)
      return null
    }
    await markStale(ctx, p, applied, p.decidedBy, true)
    await mailNotLive(ctx, p.site, p.decidedBy, (p.msg as HistoryMsg | undefined) ?? p.sentence)
    return null
  },
})

export const reject = mutation({
  args: { proposal: v.string(), reason: v.string() },
  handler: async (ctx, args): Promise<Json> => {
    const { actor, proposal: p } = await actorForProposal(ctx, args.proposal)
    requireDecide(actor, p)
    const reason = args.reason.trim()
    if (reason.length < 1 || reason.length > REASON_MAX) fail('INVALID', 'errors.reasonOneSentence', { reasonMax: REASON_MAX })
    if (p.status !== 'open' && !(p.status === 'scheduled' && !p.release)) fail('CHANGED_SINCE', 'errors.proposalNoLongerOpen', undefined, { status: p.status })
    if (p.job) await ctx.scheduler.cancel(p.job)
    await ctx.db.patch(p._id, { status: 'rejected', reason, decidedBy: actor.user.id, decidedAt: Date.now(), job: undefined, release: undefined })
    // A rejection needs the author to act, often the same day; an approval needs nothing (decisions: email on rejection only).
    if (p.author !== actor.user.id) await mailRejected(ctx, p, reason)
    return { proposal: p._id, status: 'rejected' }
  },
})

/** The author takes their own proposal back, as long as nobody decided it. */
export const withdraw = mutation({
  args: { proposal: v.string() },
  handler: async (ctx, args): Promise<Json> => {
    const { actor, proposal: p } = await actorForProposal(ctx, args.proposal)
    if (p.author !== actor.user.id) fail('FORBIDDEN', 'errors.onlyProposerCanWithdraw')
    if (p.status !== 'open') fail('CHANGED_SINCE', 'errors.proposalNoLongerOpen', undefined, { status: p.status })
    await ctx.db.patch(p._id, { status: 'withdrawn', decidedBy: actor.user.id, decidedAt: Date.now(), release: undefined })
    return { proposal: p._id, status: 'withdrawn' }
  },
})

// ---- Reading ----

async function summary(p: Doc<'proposals'>, actor: Actor, names: Labeler) {
  return {
    proposal: p._id, op: p.op, brick: p.brick, entry: p.entry ?? null, task: taskOf(p.args) ?? null, sentence: p.sentence, msg: p.msg ?? null, status: p.status,
    author: await names.who(p.author), mine: p.author === actor.user.id, via: p.via, agent: await names.key(p.agentKey),
    createdAt: p.createdAt, at: p.at ?? null, release: p.release ?? null,
    decidedBy: p.decidedBy ? await names.who(p.decidedBy) : null, decidedAt: p.decidedAt ?? null, reason: p.reason ?? null, reasonMsg: p.reasonMsg ?? null,
    change: p.change ?? null,
    /** Whether the signed-in person may approve or reject it (not staff, not their own). */
    canDecide: isApprover(actor) && (p.author !== actor.user.id || p.via === 'agent') && (p.status === 'open' || p.status === 'scheduled'),
  }
}

/** A row of the inbox: an open or scheduled one carries `conflict` (and its message `conflictMsg`), why it would be stale if decided now. */
async function inboxRow(ctx: QueryCtx, p: Doc<'proposals'>, actor: Actor, names: Labeler) {
  const conflict = p.status === 'open' || p.status === 'scheduled' ? await staleReason(ctx, p) : null
  return { ...(await summary(p, actor, names)), conflict: conflict?.reason ?? null, conflictMsg: conflict?.msg ?? null }
}

/** Open proposals this person has to look at: for an approver all of the site, for an author their own. */
async function openCount(ctx: QueryCtx, actor: Actor): Promise<number> {
  const open = await ctx.db.query('proposals').withIndex('by_site_status', (q) => q.eq('site', actor.site._id).eq('status', 'open')).collect()
  return open.filter((p) => isApprover(actor) || p.author === actor.user.id).length
}

/**
 * Proposals of a site, newest first (`order: 'oldest'` reverses it). Approvers see all of them, authors their own.
 * `status` narrows. A paginated query (`useConvexPaginatedQuery`), at most 50 rows a page. Every row is an
 * `inboxRow`, so the inbox needs no `get` per row. `count` is the number of open ones.
 */
export const list = query({
  args: { site: v.string(), status: v.optional(status), order: v.optional(v.union(v.literal('newest'), v.literal('oldest'))), paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    const actor = await siteActor(ctx, args.site)
    const site = actor.site._id
    const wanted = args.status
    const rows = isApprover(actor)
      ? wanted
        ? ctx.db.query('proposals').withIndex('by_site_status', (q) => q.eq('site', site).eq('status', wanted))
        : ctx.db.query('proposals').withIndex('by_site', (q) => q.eq('site', site))
      : ctx.db.query('proposals').withIndex('by_site_author', (q) => q.eq('site', site).eq('author', actor.user.id)).filter((q) => (wanted ? q.eq(q.field('status'), wanted) : true))
    const opts = args.paginationOpts
    let page
    try {
      page = await rows.order(args.order === 'oldest' ? 'asc' : 'desc').paginate({ ...opts, numItems: Math.min(opts.numItems, PAGE_SIZE) })
    } catch (error) {
      // The cursor comes from the client; the database refuses one it did not hand out.
      if (opts.cursor === null) throw error
      fail('INVALID', 'errors.pageMarkerInvalid')
    }
    const names = await labeler(ctx, actor)
    return { ...page, page: await Promise.all(page.page.map((p) => inboxRow(ctx, p, actor, names))) }
  },
})

/**
 * The actor's own proposals of one status (else of any), 50 at most: newest first; of one decided status the
 * latest decided first. `since` keeps only those decided after it.
 */
async function ownDocs(ctx: QueryCtx, actor: Actor, wanted?: Doc<'proposals'>['status'], since?: number) {
  const own = wanted
    ? ctx.db.query('proposals').withIndex('by_site_author_status_decided', (q) => {
        const status = q.eq('site', actor.site._id).eq('author', actor.user.id).eq('status', wanted)
        return since === undefined ? status : status.gt('decidedAt', since)
      })
    : ctx.db.query('proposals').withIndex('by_site_author', (q) => q.eq('site', actor.site._id).eq('author', actor.user.id))
  return own.order('desc').take(PAGE_SIZE)
}

/** The actor's own proposals, newest first (50 at most), also for an approver: the agent door tells a person what of theirs still waits (SPEC 16). */
export async function ownAs(ctx: QueryCtx, actor: Actor, wanted?: Doc<'proposals'>['status']) {
  const rows = await ownDocs(ctx, actor, wanted)
  const names = await labeler(ctx, actor)
  return Promise.all(rows.map((p) => summary(p, actor, names)))
}

/** Long enough to be read after a weekend off; older rejections and failed plans are only in the approver's history. */
const RECENT_MS = 14 * 24 * 60 * 60 * 1000

/**
 * The top of History (UI.md 10.4), also for an approver: the person's own open proposals (`open`), their own
 * proposals rejected in the last two weeks (`rejected`), and planned changes that did not go live in the last
 * two weeks because they no longer fitted at their time (`notLive`): for an approver of the whole site, who
 * planned them, else their own. Each list reads at most 50 rows through an index.
 */
export const mine = query({
  args: { site: v.string() },
  handler: async (ctx, args) => {
    const actor = await siteActor(ctx, args.site)
    // The window is an index range over decidedAt, so a proposal created long ago and decided today is not
    // crowded out by 50 newer ones. Convex does not re-run a query as time passes: a row may stay past day 14
    // until something else changes the result.
    const since = Date.now() - RECENT_MS
    const stale = isApprover(actor)
      ? await ctx.db.query('proposals').withIndex('by_site_status_decided', (q) => q.eq('site', actor.site._id).eq('status', 'stale').gt('decidedAt', since)).order('desc').take(PAGE_SIZE)
      : await ownDocs(ctx, actor, 'stale', since)
    const names = await labeler(ctx, actor)
    const rows = (docs: Doc<'proposals'>[]) => Promise.all(docs.map((p) => summary(p, actor, names)))
    // A rejected save stays only while it is still the thing to fix (`followUp`): not after a newer proposal on the
    // entry, nor after a later change of its fields.
    const recent = await ownDocs(ctx, actor)
    const rejected = []
    for (const p of await ownDocs(ctx, actor, 'rejected', since)) {
      if (p.op !== 'save' || !p.entry || p.via !== 'ui' || (await followUp(ctx, recent, p.entry))?._id === p._id) rejected.push(p)
    }
    return {
      open: await rows(await ownDocs(ctx, actor, 'open')),
      rejected: await rows(rejected),
      notLive: await rows(stale.filter((p) => p.at !== undefined)),
    }
  },
})

/**
 * The author's proposal to follow up on for one entry in the Studio, from their newest own proposals (`ownDocs`): their
 * newest save of the entry made in the Studio (an agent's proposals are reviewed in the inbox) when it is open, or when
 * it was rejected in the last two weeks and still fits (`staleReason`). A newer own proposal on the entry, or a later
 * change of those fields, makes an older rejection moot.
 */
async function followUp(ctx: QueryCtx, recent: Doc<'proposals'>[], entry: Id<'entries'>): Promise<Doc<'proposals'> | null> {
  const p = recent.find((r) => r.op === 'save' && r.via === 'ui' && r.entry === entry)
  if (!p) return null
  if (p.status === 'open') return p
  if (p.status !== 'rejected' || (p.decidedAt ?? 0) <= Date.now() - RECENT_MS) return null
  return (await staleReason(ctx, p)) ? null : p
}

/**
 * The signed-in person's own proposal for an entry that a task sheet starts from (`followUp`): the fields it sent,
 * and for a rejection who rejected it and why. `fits` is false for an open one whose fields someone changed since
 * (`staleReason`): the sheet then starts from the stored values, so sending again does not bring the old ones back
 * with a fresh base. `null` when there is nothing to follow up.
 */
export const ownFor = query({
  args: { site: v.string(), entry: v.string() },
  handler: async (ctx, args) => {
    const actor = await siteActor(ctx, args.site)
    const entry = ctx.db.normalizeId('entries', args.entry)
    const p = entry ? await followUp(ctx, await ownDocs(ctx, actor), entry) : null
    if (!p) return null
    const names = await labeler(ctx, actor)
    const sent = p.args as { fields?: Record<string, Json> }
    return {
      proposal: p._id, status: p.status, task: taskOf(p.args) ?? null, fields: sent.fields ?? {}, createdAt: p.createdAt,
      // A rejection `followUp` returns fits already.
      fits: p.status !== 'open' || (await staleReason(ctx, p)) === null,
      decidedAt: p.decidedAt ?? null, decidedBy: p.decidedBy ? await names.who(p.decidedBy) : null, reason: p.reason ?? null,
    }
  },
})

/** "Zu prüfen (n)": open proposals a signed-in approver has to look at; for authors their own open ones. */
export const count = query({
  args: { site: v.string() },
  handler: async (ctx, args): Promise<number> => {
    const actor = await siteActor(ctx, args.site)
    return openCount(ctx, actor)
  },
})

/** One proposal with before/after per field, for the diff. `conflict` is the reason it would be stale if decided now. */
export const get = query({
  args: { site: v.string(), proposal: v.string() },
  handler: async (ctx, args) => {
    const actor = await siteActor(ctx, args.site)
    const id = ctx.db.normalizeId('proposals', args.proposal)
    const p = id ? await ctx.db.get(id) : null
    if (!p || p.site !== actor.site._id || (!isApprover(actor) && p.author !== actor.user.id)) fail('NOT_FOUND', 'errors.proposalNotFound')
    const schema = actor.site.schema as Schema
    const brick = Object.hasOwn(schema.bricks, p.brick) ? schema.bricks[p.brick] : undefined
    const before = (p.before ?? {}) as Record<string, Json>
    const after = (p.after ?? {}) as Record<string, Json>
    // In the reader's language; the dates are written in the site's zone.
    const locale = await localeOfUser(ctx, actor.user.id)
    const when = (state: Json | undefined, publishAt: Json | undefined) => {
      if (typeof state !== 'string') return null
      const name = state === 'draft' ? msg('history.stateDraft') : state === 'live' ? msg('history.stateLive') : undefined
      if (typeof publishAt !== 'number') return name ? historyText(name, locale, schema) : state
      return historyText(msg('history.stateScheduled', { state: name ?? state, at: publishAt }), locale, schema)
    }
    const diff = p.op === 'publish' || p.op === 'unpublish'
      ? [{ field: 'state', label: t(locale, 'history.stateField'), kind: 'state', before: when(before.state, before.publishAt), after: when(after.state, after.publishAt) }]
      : diffFields(brick?.fields, before, after, schema.locales[0]!)
    const names = await labeler(ctx, actor)
    const conflict = p.status === 'open' || p.status === 'scheduled' ? await staleReason(ctx, p) : null
    return {
      ...(await summary(p, actor, names)), diff, base: p.base as Json,
      conflict: conflict?.reason ?? null, conflictMsg: conflict?.msg ?? null,
    }
  },
})

// ---- Releases: proposals approved together, all or none ----

/** A release with every member as an `inboxRow`, so the inbox shows the members whichever page of `list` is loaded. */
const releaseSummary = async (ctx: QueryCtx, r: Doc<'releases'>, actor: Actor, names: Labeler) => {
  const members = await ctx.db.query('proposals').withIndex('by_release', (q) => q.eq('release', r._id)).collect()
  return {
    release: r._id, name: r.name, status: r.status, at: r.at ?? null, createdAt: r.createdAt, decidedAt: r.decidedAt ?? null,
    proposals: await Promise.all(members.map((p) => inboxRow(ctx, p, actor, names))),
  }
}

/**
 * The site's releases still to decide (open or stale), newest first (50 at most), each with its proposals.
 * Decided ones are left out: each member costs reads of its entry. Approvers only: staff sees proposals, not their grouping.
 */
export const releases = query({
  args: { site: v.string() },
  handler: async (ctx, args) => {
    const actor = await siteActor(ctx, args.site)
    if (!isApprover(actor)) fail('FORBIDDEN', 'errors.ownersOnly')
    const of = (status: 'open' | 'stale') =>
      ctx.db.query('releases').withIndex('by_site_status', (q) => q.eq('site', actor.site._id).eq('status', status)).order('desc').take(50)
    const rows = [...(await of('open')), ...(await of('stale'))].sort((a, b) => b._creationTime - a._creationTime).slice(0, 50)
    const names = await labeler(ctx, actor)
    return Promise.all(rows.map((r) => releaseSummary(ctx, r, actor, names)))
  },
})

/** A new release; `at` is the planned time (an approval may set another). */
export const createRelease = mutation({
  args: { site: v.string(), name: v.string(), at: v.optional(v.number()) },
  handler: async (ctx, args): Promise<Json> => {
    const actor = await siteActor(ctx, args.site)
    if (!isApprover(actor)) fail('FORBIDDEN', 'errors.ownersOnly')
    const name = args.name.trim()
    if (name.length < 1 || name.length > NAME_MAX) fail('INVALID', 'errors.nameLength1ToMax', { nameMax: NAME_MAX })
    if (args.at !== undefined) checkFuture(args.at)
    const release = await ctx.db.insert('releases', { site: actor.site._id, name, status: 'open', createdBy: actor.user.id, createdAt: Date.now(), ...(args.at === undefined ? {} : { at: args.at }) })
    return { release, status: 'open' }
  },
})

const EDITABLE = new Set(['open', 'stale'])

export const addToRelease = mutation({
  args: { release: v.string(), proposal: v.string() },
  handler: async (ctx, args): Promise<Json> => {
    const { actor, release } = await actorForRelease(ctx, args.release)
    if (!isApprover(actor)) fail('FORBIDDEN', 'errors.ownersOnly')
    const key = ctx.db.normalizeId('proposals', args.proposal)
    const p = key ? await ctx.db.get(key) : null
    if (!p || p.site !== release.site) fail('NOT_FOUND', 'errors.proposalNotFound')
    if (!EDITABLE.has(release.status)) fail('CHANGED_SINCE', 'errors.releaseNoLongerOpen', undefined, { status: release.status })
    if (p.status !== 'open') fail('CHANGED_SINCE', 'errors.proposalNoLongerOpen', undefined, { status: p.status })
    if (p.release === release._id) return { release: release._id, proposals: (await ctx.db.query('proposals').withIndex('by_release', (q) => q.eq('release', release._id)).collect()).length }
    if (p.release) fail('INVALID', 'errors.proposalInOtherRelease')
    const members = await ctx.db.query('proposals').withIndex('by_release', (q) => q.eq('release', release._id)).collect()
    if (members.length >= RELEASE_MAX) fail('INVALID', 'errors.releaseTooManyProposals', { releaseMax: RELEASE_MAX })
    await ctx.db.patch(p._id, { release: release._id })
    return { release: release._id, proposals: members.length + 1 }
  },
})

export const removeFromRelease = mutation({
  args: { release: v.string(), proposal: v.string() },
  handler: async (ctx, args): Promise<Json> => {
    const { actor, release } = await actorForRelease(ctx, args.release)
    if (!isApprover(actor)) fail('FORBIDDEN', 'errors.ownersOnly')
    const key = ctx.db.normalizeId('proposals', args.proposal)
    const p = key ? await ctx.db.get(key) : null
    if (!p || p.release !== release._id) fail('NOT_FOUND', 'errors.proposalNotInRelease')
    if (!EDITABLE.has(release.status)) fail('CHANGED_SINCE', 'errors.releaseNoLongerOpen', undefined, { status: release.status })
    await ctx.db.patch(p._id, { release: undefined })
    return { release: release._id }
  },
})

/** Stale members of a release, checked together without writing (a member can also collide with an earlier one). */
async function staleMembers(ctx: QueryCtx, members: Doc<'proposals'>[]) {
  const touched: Touched = new Map()
  const stale: { proposal: Id<'proposals'>; sentence: string; reason: string; reasonMsg: HistoryMsg }[] = []
  for (const p of members) {
    const reason = await staleReason(ctx, p, touched)
    if (reason) stale.push({ proposal: p._id, sentence: p.sentence, reason: reason.reason, reasonMsg: reason.msg })
  }
  return stale
}

/**
 * Applies every proposal of the release in one mutation: all or none. A member that no longer fits
 * is found first and marked stale; it blocks the release, which is answered with the list. Remove
 * the stale members (removeFromRelease) and approve again. With `at` (or the release's planned
 * time, when it is still ahead) the release is scheduled and re-checked when it runs.
 */
export const approveRelease = mutation({
  args: { release: v.string(), at: v.optional(v.number()) },
  handler: async (ctx, args): Promise<Json> => {
    const { actor, release } = await actorForRelease(ctx, args.release)
    if (!isApprover(actor)) fail('FORBIDDEN', 'errors.ownersOnly')
    if (!EDITABLE.has(release.status)) fail('CHANGED_SINCE', 'errors.releaseNoLongerOpen', undefined, { status: release.status })
    const by = actor.user.id
    const all = await ctx.db.query('proposals').withIndex('by_release', (q) => q.eq('release', release._id)).collect()
    const members = all.filter((p) => p.status === 'open')
    const blocked = all.filter((p) => p.status === 'stale').map((p) => ({ proposal: p._id, sentence: p.sentence, reason: p.reason ?? '', reasonMsg: p.reasonMsg ?? null }))
    if (!members.length && !blocked.length) fail('INVALID', 'errors.releaseEmpty')
    for (const p of members) requireDecide(actor, p)
    if (blocked.length) return { release: release._id, status: 'stale', stale: blocked }

    if (args.at !== undefined) checkFuture(args.at)
    const now = Date.now()
    const at = args.at ?? (release.at !== undefined && release.at > now ? release.at : undefined)
    const stale = await staleMembers(ctx, members)
    if (stale.length) {
      for (const s of stale) await markStale(ctx, members.find((p) => p._id === s.proposal)!, { reason: s.reason, msg: s.reasonMsg }, by)
      await ctx.db.patch(release._id, { status: 'stale' })
      return { release: release._id, status: 'stale', stale }
    }

    if (at !== undefined) {
      const job = await ctx.scheduler.runAt(at, internal.proposals.applyReleaseScheduled, { release: release._id, at })
      for (const p of members) await ctx.db.patch(p._id, { status: 'scheduled', at, decidedBy: by, decidedAt: now })
      await ctx.db.patch(release._id, { status: 'scheduled', at, job, decidedBy: by, decidedAt: now })
      return { release: release._id, status: 'scheduled', at }
    }

    // Oldest first. The first failure throws: the mutation, and with it every write above, is rolled back.
    for (const p of members.sort((a, b) => a._creationTime - b._creationTime)) {
      const applied = await applyNow(ctx, p, by)
      if (!applied.ok) fail('STALE', 'errors.proposalNoLongerFitsRelease', undefined, { release: release._id, stale: [{ proposal: p._id, sentence: p.sentence, reason: applied.reason, reasonMsg: applied.msg }] })
      await markApplied(ctx, p, by, applied.change)
    }
    await ctx.db.patch(release._id, { status: 'applied', decidedBy: by, decidedAt: now, job: undefined })
    return { release: release._id, status: 'applied', applied: members.length }
  },
})

/**
 * The run of a scheduled release. A member that went stale blocks it; the others go back to open.
 * Applying is all or none, so a member that fails while being written rolls the whole run back. The
 * job is an action for that case: the failure is then recorded in its own mutation (`releaseFailed`)
 * instead of leaving the release "scheduled" with nobody told.
 */
export const applyReleaseScheduled = internalAction({
  args: { release: v.id('releases'), at: v.number() },
  handler: async (ctx, args): Promise<null> => {
    try {
      await ctx.runMutation(internal.proposals.runScheduledRelease, args)
    } catch (error) {
      const data = error instanceof ConvexError ? error.data as { code?: string; details?: { stale?: StaleMember[] } } : undefined
      await ctx.runMutation(internal.proposals.releaseFailed, { ...args, stale: data?.code === 'STALE' ? data.details?.stale ?? [] : [] })
      // Anything but a member that no longer fits is a bug: it stays visible in the logs.
      if (data?.code !== 'STALE') throw error
    }
    return null
  },
})

type StaleMember = { proposal: Id<'proposals'>; reason: string; reasonMsg: HistoryMsg }

export const runScheduledRelease = internalMutation({
  args: { release: v.id('releases'), at: v.number() },
  handler: async (ctx, args): Promise<null> => {
    const release = await ctx.db.get(args.release)
    if (!release || release.status !== 'scheduled' || release.at !== args.at || !release.decidedBy) return null
    const by = release.decidedBy
    const members = await scheduledMembers(ctx, release._id)
    const site = await ctx.db.get(release.site)
    const approver = site && await memberOf(ctx, site, { id: by })
    const stale = approver && isApprover(approver)
      ? await staleMembers(ctx, members)
      : members.map((p) => { const why = staleBecause('history.staleApproverNotAllowed'); return { proposal: p._id, sentence: p.sentence, reason: why.reason, reasonMsg: why.msg } })
    if (stale.length) {
      await blockRelease(ctx, release, members, stale)
      return null
    }
    for (const p of members) {
      const applied = await applyNow(ctx, p, by)
      if (!applied.ok) fail('STALE', 'errors.proposalNoLongerFitsRelease', undefined, { release: release._id, stale: [{ proposal: p._id, reason: applied.reason, reasonMsg: applied.msg }] })
      await markApplied(ctx, p, by, applied.change)
    }
    await ctx.db.patch(release._id, { status: 'applied', job: undefined })
    return null
  },
})

/** A scheduled release whose run was rolled back: the failing member is stale with its reason, the others are open again. */
export const releaseFailed = internalMutation({
  args: { release: v.id('releases'), at: v.number(), stale: v.array(v.object({ proposal: v.id('proposals'), reason: v.string(), reasonMsg: v.any() })) },
  handler: async (ctx, args): Promise<null> => {
    const release = await ctx.db.get(args.release)
    if (!release || release.status !== 'scheduled' || release.at !== args.at) return null
    await blockRelease(ctx, release, await scheduledMembers(ctx, release._id), args.stale as StaleMember[])
    return null
  },
})

const scheduledMembers = async (ctx: QueryCtx, release: Id<'releases'>) =>
  (await ctx.db.query('proposals').withIndex('by_release', (q) => q.eq('release', release)).collect())
    .filter((p) => p.status === 'scheduled').sort((a, b) => a._creationTime - b._creationTime)

/** The release did not go live: stale members keep their reason, the rest go back to open, and the approver is told. */
async function blockRelease(ctx: MutationCtx, release: Doc<'releases'>, members: Doc<'proposals'>[], stale: StaleMember[]) {
  const by = release.decidedBy!
  for (const p of members) {
    const s = stale.find((x) => x.proposal === p._id)
    if (s) await markStale(ctx, p, { reason: s.reason, msg: s.reasonMsg }, by, true)
    else await reopen(ctx, p)
  }
  await ctx.db.patch(release._id, { status: 'stale', job: undefined })
  await mailNotLive(ctx, release.site, by, release.name)
}

/**
 * Tells the approver that a change they planned did not go live (SPEC 17). Without this, a planned
 * change that no longer fits fails at night and the inbox still says "scheduled".
 */
async function mailNotLive(ctx: MutationCtx, siteId: Id<'sites'>, approver: string, what: HistoryMsg | string) {
  const site = await ctx.db.get(siteId)
  if (!site || !mailAvailable()) return
  const member = await ctx.db.query('memberships').withIndex('by_site', (q) => q.eq('site', site._id)).filter((q) => q.eq(q.field('user'), approver)).first()
  if (!member?.email) return
  const locale = await localeOfUser(ctx, member.user)
  await queueMail(ctx, {
    to: member.email,
    subject: t(locale, 'mail.notLive.subject', { site: site.name }),
    text: t(locale, 'mail.notLive.text', { site: site.name, what: typeof what === 'string' ? what : historyText(what, locale, site.schema as Schema), path: `${siteOrigin()}/s/${site.slug}/history` }),
  })
}

/**
 * Tells the author at once that their proposal was not approved, with the approver's reason and a link that reopens
 * it in its task (Schnell ändern), else Schnell ändern itself. An assistant's proposal is not reopened in the Studio
 * (`followUp`): its link is Verlauf, which lists it with the reason. In the author's language.
 */
async function mailRejected(ctx: MutationCtx, p: Doc<'proposals'>, reason: string) {
  const site = await ctx.db.get(p.site)
  if (!site || !mailAvailable()) return
  const member = await ctx.db.query('memberships').withIndex('by_site', (q) => q.eq('site', site._id)).filter((q) => q.eq(q.field('user'), p.author)).first()
  if (!member?.email) return
  const locale = await localeOfUser(ctx, member.user)
  const task = taskOf(p.args)
  const fix = p.via === 'agent' ? '/history' : p.op === 'save' && p.entry && task ? `?task=${encodeURIComponent(task)}&reopen=${p._id}` : ''
  await queueMail(ctx, {
    to: member.email,
    subject: t(locale, 'mail.rejected.subject', { site: site.name }),
    text: t(locale, 'mail.rejected.text', { site: site.name, what: p.msg ? historyText(p.msg as HistoryMsg, locale, site.schema as Schema) : p.sentence, reason, path: `${siteOrigin()}/s/${site.slug}${fix}` }),
  })
}

// ---- Mail: one digest for the approvers ----

/**
 * The digest mail (SPEC 17): runs 10 minutes after the first open proposal of a site and lists every
 * open proposal not yet mailed, so proposals made in the window share one mail. Goes to the owners
 * of the site; nothing is sent when none is still open or mail is not set up.
 */
export const sendDigest = internalMutation({
  args: { site: v.id('sites') },
  handler: async (ctx, args): Promise<null> => {
    const site = await ctx.db.get(args.site)
    if (!site || site.deleting) return null
    await ctx.db.patch(site._id, { digestAt: undefined })
    const open = (await ctx.db.query('proposals').withIndex('by_site_status', (q) => q.eq('site', site._id).eq('status', 'open')).collect())
      .filter((p) => p.mailedAt === undefined)
    if (!open.length || !mailAvailable()) return null
    const members = await ctx.db.query('memberships').withIndex('by_site', (q) => q.eq('site', site._id)).collect()
    const emailOf = new Map(members.map((m) => [m.user as string, m.email]))
    const nameOf = namer(ctx)
    const schema = site.schema as Schema
    const who: { author: string; name?: string; viaAgent: boolean; ai: string | null; sentence: string; msg?: HistoryMsg }[] = []
    for (const p of open) {
      // The key's label ("Claude Code"); null when the key is gone, then the line says only "via AI".
      const ai = p.agentKey ? (await ctx.db.get(p.agentKey))?.label ?? null : null
      const name = await nameOf(p.author)
      who.push({ author: p.author, ...(name ? { name } : {}), viaAgent: p.via === 'agent', ai, sentence: p.sentence, ...(p.msg ? { msg: p.msg as HistoryMsg } : {}) })
    }
    // Each owner gets the mail in their own language.
    for (const owner of members.filter((m) => m.role === 'owner' && m.email)) {
      const locale = await localeOfUser(ctx, owner.user)
      const lines = who.map((w) => {
        // As the Studio shows people to owners: the name the person set, with the address they verified.
        const email = emailOf.get(w.author)
        const name = email ? (w.name ? `${w.name} (${email})` : email) : w.name ?? t(locale, 'mail.digest.someone')
        const via = !w.viaAgent ? '' : ` ${w.ai ? t(locale, 'mail.digest.viaAi', { ai: w.ai }) : t(locale, 'mail.digest.viaAiUnnamed')}`
        return `- ${name}${via}: ${w.msg ? historyText(w.msg, locale, schema) : w.sentence}`
      })
      await queueMail(ctx, {
        to: owner.email!,
        subject: t(locale, 'mail.digest.subject', { count: open.length, site: site.name }),
        text: t(locale, 'mail.digest.text', { count: open.length, site: site.name, lines: lines.join('\n'), path: `${siteOrigin()}/s/${site.slug}/review` }),
      })
    }
    const now = Date.now()
    for (const p of open) await ctx.db.patch(p._id, { mailedAt: now })
    return null
  },
})
