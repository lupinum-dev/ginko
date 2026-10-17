// The approval policy (SPEC 17), in one place: which writes become proposals, and the proposal
// itself. The operations in entries.ts ask `needsProposal` after their checks passed and call
// `propose` instead of writing. Approving runs the same operation again (proposals.ts).
import type { Json, Task } from '@lupinum/ginko'
import { byteSize, type Schema } from '@lupinum/ginko/internal'
import { internal } from '../_generated/api'
import type { Doc, Id } from '../_generated/dataModel'
import type { MutationCtx, QueryCtx } from '../_generated/server'
import { fail, type Actor } from './access'
import { rootOf } from './content'
import type { Recorded } from './history'

export type ProposalOp = Doc<'proposals'>['op']

/** Digest mail: the first open proposal of a site sends it this long later; later ones join it. */
export const DIGEST_DELAY = 10 * 60 * 1000
/** An open proposal holds the operation's arguments and the changed fields twice: keep it far below the 1 MiB row limit. */
const PROPOSAL_BYTES = 900 * 1024
/** Open proposals per site; more than this is a flood, not a review queue. */
export const OPEN_MAX = 200

/** Whether agent writes of this key are proposals: the key's own setting, then the site's, then `agents.review` of the config, then off. */
export function effectiveReview(key: Pick<Doc<'agentKeys'>, 'review'> | null, site: Pick<Doc<'sites'>, 'agentReview' | 'schema'>): boolean {
  return key?.review ?? site.agentReview ?? (site.schema as Schema).agents?.review ?? false
}

/** The tasks of a brick that the actor holds; `ref` (a `brick.id` TaskRef) narrows to one. */
function heldTasks(actor: Actor, brick: string, ref?: string): Task[] {
  const schema = actor.site.schema as Schema
  const def = Object.hasOwn(schema.bricks, brick) ? schema.bricks[brick] : undefined
  const tasks = def?.tasks ?? []
  return tasks.filter((t) => actor.grants.includes(`${brick}.${t.id}`) && (ref === undefined || ref === `${brick}.${t.id}`))
}

/**
 * Does this write wait for a yes? `entry` is the entry it touches; for `create` pass what the new
 * entry will be (`{ state: 'draft' }` for a plain draft). True when
 *  (a) staff holds a task with `needsApproval` and the write touches live content (a draft is not
 *      live, so editing or removing one is direct; publish and unpublish always touch live content), or
 *  (b) the call came through an agent key whose effective review is on.
 *  (c) the assistant asked for it with `propose: true` (SPEC 16), whatever the entry's state.
 * Owners and admins in the platform are always direct. An approved proposal being applied is too.
 * For publish and unpublish no single task is named, so staff needs approval when any create or
 * edit task of the brick they hold has the flag (the same tasks `authorizeWriter` accepts).
 */
export async function needsProposal(
  ctx: QueryCtx, actor: Actor, op: ProposalOp, taskRef: string | undefined, brick: string, entry: Pick<Doc<'entries'>, 'state'>,
): Promise<boolean> {
  if (actor.approvedBy) return false
  if (actor.forceProposal) return true
  if (entry.state === 'draft' && op !== 'publish' && op !== 'unpublish') return false
  if (actor.role === 'staff') {
    const tasks = op === 'publish' || op === 'unpublish' ? heldTasks(actor, brick).filter((t) => t.kind !== 'remove') : heldTasks(actor, brick, taskRef)
    if (tasks.some((t) => t.needsApproval === true)) return true
  }
  if (actor.agentKey) return effectiveReview(await ctx.db.get(actor.agentKey), actor.site)
  return false
}

/**
 * Undo and restore write live content without a task of their own. Staff whose task needs approval
 * may not use them to get around the proposal: they propose the change again instead.
 */
export function directWriteRefused(actor: Actor, brick: string, taskRef: string | undefined): boolean {
  return actor.role === 'staff' && !actor.approvedBy && heldTasks(actor, brick, taskRef).some((t) => t.needsApproval === true)
}

export function refuseDirectWrite(actor: Actor, brick: string, taskRef: string | undefined) {
  if (directWriteRefused(actor, brick, taskRef)) {
    fail('FORBIDDEN', 'errors.needsApprovalProposeAgain')
  }
}

/**
 * Undo has no proposal form, so an agent key under review may not undo live content: it would write
 * past the review (SPEC 17). `ginko_revert` goes back as a normal save, which becomes a proposal.
 */
export async function refuseAgentUndo(ctx: QueryCtx, actor: Actor, entry: Pick<Doc<'entries'>, 'state'>) {
  if (!actor.agentKey || actor.approvedBy || entry.state === 'draft') return
  if (effectiveReview(await ctx.db.get(actor.agentKey), actor.site)) fail('FORBIDDEN', 'errors.agentUndoNeedsReview')
}

export interface NewProposal extends Recorded {
  op: ProposalOp
  brick: string
  entry?: Id<'entries'>
  /** The arguments of the operation, as called (with `opId`). */
  args: Json
  /** Revisions the author saw: what the freshness check at approval compares against. */
  base: Json
  before?: Json
  after?: Json
}

/**
 * Stores the proposal and makes sure the site's digest mail is scheduled. The result tells the caller that nothing was written.
 * A save can replace the author's older open save of the same entry (`withdrawReplaced`).
 */
export async function propose(ctx: MutationCtx, actor: Actor, p: NewProposal): Promise<{ proposal: Id<'proposals'>; status: 'open' }> {
  if (byteSize([p.args, p.before, p.after]) > PROPOSAL_BYTES) fail('TOO_LARGE', 'errors.proposalTooLarge')
  if (p.op === 'save' && p.entry) await withdrawReplaced(ctx, actor, p.entry, p.args)
  const open = await ctx.db.query('proposals').withIndex('by_site_status', (q) => q.eq('site', actor.site._id).eq('status', 'open')).take(OPEN_MAX)
  if (open.length >= OPEN_MAX) fail('INVALID', 'errors.tooManyOpenProposals', { openMax: OPEN_MAX })
  const proposal = await ctx.db.insert('proposals', {
    site: actor.site._id, op: p.op, brick: p.brick, ...(p.entry ? { entry: p.entry } : {}),
    args: p.args, base: p.base, ...(p.before === undefined ? {} : { before: p.before }), ...(p.after === undefined ? {} : { after: p.after }),
    sentence: p.sentence, msg: p.msg, author: actor.user.id, via: actor.agentKey ? 'agent' : 'ui', ...(actor.agentKey ? { agentKey: actor.agentKey } : {}),
    status: 'open', createdAt: Date.now(),
  })
  await scheduleDigest(ctx, actor.site._id)
  return { proposal, status: 'open' }
}

/** The task a proposal was made with (`args.task`), if any. */
export const taskOf = (args: unknown): string | undefined => {
  const task = (args as { task?: unknown } | null)?.task
  return typeof task === 'string' ? task : undefined
}

/** What a save writes: its task, its language (the main one when none is given) and its root fields, confirmed leaves by their root. */
function scopeOf(schema: Schema, args: unknown) {
  const a = (args ?? {}) as { locale?: unknown; fields?: unknown; confirm?: unknown }
  const fields = typeof a.fields === 'object' && a.fields !== null ? Object.keys(a.fields) : []
  const confirm = Array.isArray(a.confirm) ? a.confirm.filter((c): c is string => typeof c === 'string') : []
  return { task: taskOf(args), locale: typeof a.locale === 'string' ? a.locale : schema.locales[0], roots: new Set([...fields, ...confirm.map(rootOf)]) }
}

/**
 * A save supersedes the author's older open saves of the same entry through the same task, door and language whose
 * fields it all writes again: the Studio's sheet starts from the open proposal, so sending it again carries every value
 * of it, and an assistant that sets the same field again means the newer value. The older one is withdrawn instead of
 * going stale when the newer one is approved. One with a field the new save leaves out stays open, since nothing
 * replaces that value (two edits of one dish through one task, a revert of only some fields).
 */
async function withdrawReplaced(ctx: MutationCtx, actor: Actor, entry: Id<'entries'>, args: Json) {
  const schema = actor.site.schema as Schema
  const via = actor.agentKey ? 'agent' : 'ui'
  const now = scopeOf(schema, args)
  const open = await ctx.db.query('proposals').withIndex('by_site_author_status_decided', (q) => q.eq('site', actor.site._id).eq('author', actor.user.id).eq('status', 'open')).take(OPEN_MAX)
  for (const old of open) {
    if (old.op !== 'save' || old.entry !== entry || old.via !== via) continue
    const was = scopeOf(schema, old.args)
    if (was.task !== now.task || was.locale !== now.locale || [...was.roots].some((r) => !now.roots.has(r))) continue
    await ctx.db.patch(old._id, { status: 'withdrawn', decidedBy: actor.user.id, decidedAt: Date.now(), release: undefined })
  }
}

/** The first open proposal schedules the digest; proposals created before it runs ride along. A lost job is replaced after an hour. */
async function scheduleDigest(ctx: MutationCtx, siteId: Id<'sites'>) {
  const site = await ctx.db.get(siteId)
  const now = Date.now()
  if (!site || (site.digestAt !== undefined && site.digestAt > now - 60 * 60 * 1000)) return
  await ctx.db.patch(siteId, { digestAt: now + DIGEST_DELAY })
  await ctx.scheduler.runAfter(DIGEST_DELAY, internal.proposals.sendDigest, { site: siteId })
}
