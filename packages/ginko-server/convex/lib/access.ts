// Steps 1, 2 and 4 of the shared write flow (SPEC 4.1): who, repeated op, may they.
// Every write operation goes through `beginOp` and ends with `finishOp`.
import type { Json, Task } from '@lupinum/ginko'
import { plansThisWeek, resolveToken, sha256, stableJson, type Schema } from '@lupinum/ginko/internal'
import type { Doc, Id } from '../_generated/dataModel'
import type { ActionCtx, MutationCtx, QueryCtx } from '../_generated/server'
import { auth } from '../auth'
import { isRev, OP_ID } from './input'

import { fail } from './fail'

// Errors carry a code, a catalog key and a message in the caller's language (SPEC 11); see `fail`.
export { fail, type ErrorCode } from './fail'

export interface User { id: string; email?: string }

/**
 * The signed-in user, read live from the Better Auth session. The Convex JWT only names the
 * session (`sid`); `auth.getUser` checks that session row, so a revoked or deleted session
 * loses access at once instead of at token expiry.
 */
export async function currentUser(ctx: QueryCtx | ActionCtx): Promise<User> {
  const user = await auth.getUser(ctx)
  if (!user) fail('FORBIDDEN', 'errors.signInRequired')
  // Invites and admin rights follow the email, so only a proven address counts.
  return { id: user.id, ...(user.email && user.emailVerified ? { email: user.email } : {}) }
}

export interface Actor {
  user: User
  site: Doc<'sites'>
  role: 'admin' | 'owner' | 'staff'
  grants: string[]
  /** Set when the call came through the agent door (SPEC 16): the person's key, for the change log. */
  agentKey?: Id<'agentKeys'>
  /** Set only while an approved proposal is applied (SPEC 17): the approver. The write goes direct and names them in the change row. */
  approvedBy?: string
  /** Set when the assistant asked to "show me first" (`propose: true`, SPEC 16): this call becomes a proposal even where the person could write directly. */
  forceProposal?: boolean
}

/** Step 1: the user must be admin or a member of the site. Unknown site and foreign site look the same. */
export async function actorFor(ctx: QueryCtx, siteSlug: string): Promise<Actor> {
  const user = await currentUser(ctx)
  const site = await ctx.db.query('sites').withIndex('by_slug', (q) => q.eq('slug', siteSlug)).unique()
  if (!site) fail('FORBIDDEN', 'errors.noAccess')
  const actor = await memberOf(ctx, site, user)
  if (!actor) fail('FORBIDDEN', 'errors.noAccess')
  return actor
}

/**
 * Role and grants of a user on a site right now, or null when they are neither admin nor member. A site that is
 * being deleted has no access for anyone (also not for agent keys and scheduled approvals), unless `deleting`
 * is set: only the cancel and status calls of `sites.ts` do that.
 */
export async function memberOf(ctx: QueryCtx, site: Doc<'sites'>, user: User, opts: { deleting?: boolean } = {}): Promise<Actor | null> {
  if (site.deleting && !opts.deleting) return null
  const admin = await ctx.db.query('admins').withIndex('by_user', (q) => q.eq('user', user.id)).unique()
  if (admin) return { user, site, role: 'admin', grants: [] }
  const member = await ctx.db.query('memberships').withIndex('by_user_site', (q) => q.eq('user', user.id).eq('site', site._id)).unique()
  return member ? { user, site, role: member.role, grants: member.grants } : null
}

/** Who a change row names: a person (with their agent key when the agent door made the call), or the system. */
export interface By { actor: string; via?: 'agent'; agentKey?: Id<'agentKeys'>; approvedBy?: string }
export const SYSTEM: By = { actor: 'system' }
export const byOf = (actor: Actor): By => ({
  actor: actor.user.id,
  ...(actor.agentKey ? { via: 'agent', agentKey: actor.agentKey } : {}),
  ...(actor.approvedBy ? { approvedBy: actor.approvedBy } : {}),
})

/**
 * Step 4 (SPEC 2.7): admin and owner may do everything on the site. Staff needs a granted
 * task of this brick and kind whose fields cover every touched root field.
 */
export function authorize(actor: Actor, schema: Schema, need: { task?: string; brick: string; kind: Task['kind']; fields?: string[] }) {
  if (actor.role !== 'staff') return
  const task = grantedTask(actor, schema, need.brick, need.task)
  const fieldsOk = task?.kind !== 'edit' || (need.fields ?? []).every((f) => task.fields.includes(f))
  if (!task || task.kind !== need.kind || !fieldsOk) fail('FORBIDDEN', 'errors.notYourTask')
}

/**
 * The brick whose tasks cover a write to `entry` with the task `ref`: the entry's own brick, or the single a live
 * planned week stands in for this week (`plansThisWeek`), so "this week's lunch" fills the week the website shows.
 */
export function taskBrickOf(schema: Schema, ref: string | undefined, entry: Pick<Doc<'entries'>, 'brick' | 'data' | 'state'>): string {
  const [taskBrick, taskId] = (ref ?? '').split('.')
  if (!taskBrick || taskBrick === entry.brick || entry.state === 'draft' || !Object.hasOwn(schema.bricks, taskBrick)) return entry.brick
  const task = schema.bricks[taskBrick]!.tasks?.find((t) => t.id === taskId)
  const thisWeek = resolveToken('@workWeek', schema.timeZone, schema.week)
  return task && thisWeek && plansThisWeek(schema, taskBrick, task, entry.brick, entry.data as Record<string, Json>, thisWeek) ? taskBrick : entry.brick
}

/**
 * Like `authorize` for operations that belong to no single task (publish, unpublish, SPEC 15):
 * staff needs any granted task of this brick that creates or edits.
 */
export function authorizeWriter(actor: Actor, schema: Schema, need: { task?: string; brick: string }) {
  if (actor.role !== 'staff') return
  const task = grantedTask(actor, schema, need.brick, need.task)
  if (task?.kind !== 'create' && task?.kind !== 'edit') fail('FORBIDDEN', 'errors.notYourTask')
}

/** The task a `TaskRef` (`brick.id`) names, if it belongs to this brick and the actor holds it. */
function grantedTask(actor: Actor, schema: Schema, brickKey: string, ref: string | undefined): Task | undefined {
  const brick = Object.hasOwn(schema.bricks, brickKey) ? schema.bricks[brickKey] : undefined
  // `task` is a TaskRef `brick.id` (SPEC 2.7), the same form as grants and tasks.prefill; it must name this brick.
  const [taskBrick, taskId, ...rest] = (ref ?? '').split('.')
  const named = taskBrick === brickKey && taskId && rest.length === 0 && actor.grants.includes(ref!)
  return named ? brick?.tasks?.find((t) => t.id === taskId) : undefined
}

/**
 * Step 2: a known opId with the same argument hash returns the stored result; a different
 * hash is OP_REUSED. Returns undefined for a new op.
 */
export async function replayed(ctx: QueryCtx, actor: Actor, opId: string, args: Json): Promise<{ hash: string; result?: Json }> {
  if (!OP_ID.test(opId)) fail('INVALID', 'errors.actionIdInvalid')
  const hash = sha256(stableJson(args))
  const row = await ctx.db.query('ops').withIndex('by_site_actor_op', (q) => q.eq('site', actor.site._id).eq('actor', actor.user.id).eq('opId', opId)).unique()
  if (!row) return { hash }
  if (row.hash !== hash) fail('OP_REUSED', 'errors.actionReusedWithOtherContent')
  return { hash, result: row.result as Json }
}

/** Last step: store the result so a retry after a lost answer gets the same one. */
export async function recordOp(ctx: MutationCtx, actor: Actor, opId: string, hash: string, result: Json) {
  await ctx.db.insert('ops', { site: actor.site._id, actor: actor.user.id, opId, hash, result, at: Date.now() })
}

/**
 * Steps 2 and 5 of a repeated op: replay the stored result, or run `run` and record its result.
 * Checks that need no loaded state belong before this call; checks after the replay go inside `run`.
 */
export async function idempotent<T extends Json>(ctx: MutationCtx, actor: Actor, args: { opId: string }, run: () => Promise<T>): Promise<T> {
  // The op hash covers every argument, so the full args object is passed; `Json` is only the stored shape.
  const { hash, result: stored } = await replayed(ctx, actor, args.opId, args as unknown as Json)
  if (stored !== undefined) return stored as T
  const result = await run()
  await recordOp(ctx, actor, args.opId, hash, result)
  return result
}

/** A revision from the client must be a whole number from 0 up. NaN would pass every `>` comparison of the conflict check. */
export function checkRev(value: number) {
  if (!isRev(value)) fail('INVALID', 'errors.versionInvalid')
}

/** Step 3: an ID must exist and belong to the site; anything else is NOT_FOUND, never a hint about other sites. */
export async function entryOf(ctx: QueryCtx, actor: Actor, id: string): Promise<Doc<'entries'>> {
  const normalized = ctx.db.normalizeId('entries', id)
  const entry = normalized ? await ctx.db.get(normalized) : null
  if (!entry || entry.site !== actor.site._id) fail('NOT_FOUND', 'errors.entryNotFound')
  return entry
}

export type SiteId = Id<'sites'>
