// Memberships of a site (SPEC 3, 2.7, 10). Owners and admins manage them; staff have no access here.
import type { Schema } from '@lupinum/ginko/internal'
import { v } from 'convex/values'
import type { Doc, Id } from './_generated/dataModel'
import { internalMutation, mutation, query, type MutationCtx, type QueryCtx } from './_generated/server'
import { actorFor, fail, type Actor } from './lib/access'
import { labeler, type Who } from './lib/names'

/** Emails are compared lowercased and trimmed everywhere (invites, admins, sign-up). */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

/** Convex env `GINKO_ADMIN_EMAILS`, comma-separated (SPEC 10). */
export function adminEmails(): string[] {
  return (process.env.GINKO_ADMIN_EMAILS ?? '').split(',').map(normalizeEmail).filter(Boolean)
}

/** Every grant must name an existing task of a live brick, `brick.task` (SPEC 2.7). Returns the grants without duplicates. */
export function checkGrants(schema: Schema, grants: string[]): string[] {
  const refs = new Set(
    Object.entries(schema.bricks)
      .filter(([, brick]) => !brick.retired)
      .flatMap(([id, brick]) => (brick.tasks ?? []).map((task) => `${id}.${task.id}`)),
  )
  for (const grant of grants) {
    if (!refs.has(grant)) fail('INVALID', 'errors.grantNotFound', { grant }, { grant })
  }
  return [...new Set(grants)]
}

/** Owners and admins only; a staff member gets FORBIDDEN. */
async function managerOf(ctx: QueryCtx, siteSlug: string): Promise<Actor> {
  const actor = await actorFor(ctx, siteSlug)
  if (actor.role === 'staff') fail('FORBIDDEN', 'errors.onlyOwnersAdminsManageMembers')
  return actor
}

/** An unknown or foreign membership id is NOT_FOUND, as for entries. */
async function memberOf(ctx: QueryCtx, actor: Actor, id: string): Promise<Doc<'memberships'>> {
  const normalized = ctx.db.normalizeId('memberships', id)
  const member = normalized ? await ctx.db.get(normalized) : null
  if (!member || member.site !== actor.site._id) fail('NOT_FOUND', 'errors.memberNotFound')
  return member
}

async function ownersOf(ctx: QueryCtx | MutationCtx, site: Id<'sites'>) {
  const members = await ctx.db.query('memberships').withIndex('by_site', (q) => q.eq('site', site)).collect()
  return members.filter((m) => m.role === 'owner')
}

/**
 * The team page: members, open invites, and the site's live push keys. Push keys belong to the site and outlive
 * their maker, so each names who made it (`by`) and, while that person is on the team, their membership (`member`).
 */
export const list = query({
  args: { site: v.string() },
  handler: async (ctx, args) => {
    const actor = await managerOf(ctx, args.site)
    const members = await ctx.db.query('memberships').withIndex('by_site', (q) => q.eq('site', actor.site._id)).collect()
    const invites = await ctx.db.query('invites').withIndex('by_site', (q) => q.eq('site', actor.site._id)).collect()
    const pushKeys = await ctx.db.query('pushKeys').withIndex('by_site', (q) => q.eq('site', actor.site._id)).collect()
    const memberOfUser = new Map(members.map((m) => [m.user as string, m._id]))
    const names = await labeler(ctx, actor)
    // Keys made with `release:bootstrapKey` come from the platform's operators.
    const by = async (createdBy: string): Promise<Who> => (createdBy === 'bootstrap' ? { kind: 'platform' } : names.who(createdBy))
    return {
      // `you`: the caller's own row, by user id (an email can differ from the account's), so the page offers no self-removal.
      members: members.map((m) => ({ id: m._id, email: m.email ?? null, role: m.role, grants: m.grants, you: m.user === actor.user.id })),
      invites: invites
        .filter((i) => i.acceptedAt === undefined)
        .map((i) => ({ id: i._id, email: i.email, role: i.role, grants: i.grants, expiresAt: i.expiresAt })),
      keys: await Promise.all(
        pushKeys
          .filter((k) => k.revokedAt === undefined)
          .map(async (k) => ({
            id: k._id,
            label: k.label,
            scopes: k.scopes,
            by: await by(k.createdBy),
            member: memberOfUser.get(k.createdBy) ?? null,
            createdAt: k._creationTime,
            lastUsedAt: k.lastUsedAt ?? null,
          })),
      ),
    }
  },
})

export const setGrants = mutation({
  args: { site: v.string(), member: v.string(), grants: v.array(v.string()) },
  handler: async (ctx, args) => {
    const actor = await managerOf(ctx, args.site)
    const member = await memberOf(ctx, actor, args.member)
    if (member.role === 'owner') fail('INVALID', 'errors.ownersHaveAllRights')
    const grants = checkGrants(actor.site.schema as Schema, args.grants)
    await ctx.db.patch(member._id, { grants })
    return { member: member._id, grants }
  },
})

export const remove = mutation({
  args: { site: v.string(), member: v.string() },
  handler: async (ctx, args) => {
    const actor = await managerOf(ctx, args.site)
    const member = await memberOf(ctx, actor, args.member)
    if (member.role === 'owner' && (await ownersOf(ctx, actor.site._id)).length <= 1) {
      fail('INVALID', 'errors.lastOwnerCannotBeRemoved')
    }
    await ctx.db.delete(member._id)
    return { member: member._id }
  },
})

/** Admin bootstrap (SPEC 10): the first sign-in with an address from GINKO_ADMIN_EMAILS makes an admin. */
export const bootstrapAdmin = internalMutation({
  args: { user: v.string(), email: v.string() },
  handler: async (ctx, args) => {
    if (!adminEmails().includes(normalizeEmail(args.email))) return
    const existing = await ctx.db.query('admins').withIndex('by_user', (q) => q.eq('user', args.user)).unique()
    if (!existing) await ctx.db.insert('admins', { user: args.user })
  },
})
