// Invitations (SPEC 10). A link carries a random token; only its sha256 is stored. Accepting needs
// a signed-in user with the invited email. Owners invite staff, admins invite owners and staff.
import { sha256, type Schema } from '@lupinum/ginko/internal'
import { v } from 'convex/values'
import type { Doc } from './_generated/dataModel'
import { internalQuery, mutation, query, type MutationCtx } from './_generated/server'
import { actorFor, currentUser, fail, type Actor } from './lib/access'
import { isEmail } from './lib/input'
import { localeOfUser, t } from './lib/i18n'
import { queueMail, siteOrigin } from './mail'
import { adminEmails, checkGrants, normalizeEmail } from './members'

const DAY_MS = 24 * 60 * 60 * 1000
const INVITE_DAYS = 7

/** 32 random bytes, base64url without padding. */
function newToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** Owners invite staff only; admins may also invite owners (SPEC 2.7). */
function mayInvite(actor: Actor, role: 'owner' | 'staff') {
  if (actor.role === 'staff') fail('FORBIDDEN', 'errors.mayNotInvite')
  if (role === 'owner' && actor.role !== 'admin') fail('FORBIDDEN', 'errors.onlyAdminInvitesOwners')
}

export const create = mutation({
  args: {
    site: v.string(),
    email: v.string(),
    role: v.union(v.literal('owner'), v.literal('staff')),
    grants: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const actor = await actorFor(ctx, args.site)
    mayInvite(actor, args.role)
    const email = normalizeEmail(args.email)
    if (!isEmail(email)) fail('INVALID', 'errors.emailInvalid')
    if (args.role === 'owner' && args.grants.length > 0) fail('INVALID', 'errors.ownersHaveAllRights')
    const grants = args.role === 'owner' ? [] : checkGrants(actor.site.schema as Schema, args.grants)

    const members = await ctx.db.query('memberships').withIndex('by_site', (q) => q.eq('site', actor.site._id)).collect()
    if (members.some((member) => member.email === email)) fail('INVALID', 'errors.alreadyOnTeam', { email })

    // A new invite replaces a pending one for the same address and site, so only the latest link works.
    const earlier = await ctx.db.query('invites').withIndex('by_email', (q) => q.eq('email', email)).collect()
    const pending = earlier.filter((invite) => invite.site === actor.site._id && invite.acceptedAt === undefined)
    // Replacing is revoking: an owner must not drop an admin's pending owner invite this way.
    for (const invite of pending) mayInvite(actor, invite.role)
    for (const invite of pending) await ctx.db.delete(invite._id)

    const token = newToken()
    // The invitee has no setting yet: the invite mail and their first sign-in code use the inviter's language.
    const locale = await localeOfUser(ctx, actor.user.id)
    const id = await ctx.db.insert('invites', {
      site: actor.site._id,
      email,
      role: args.role,
      grants,
      tokenHash: sha256(token),
      invitedBy: actor.user.id,
      expiresAt: Date.now() + INVITE_DAYS * DAY_MS,
      locale,
    })
    // Sending is checked in the same mutation: without a mail the invite is not created.
    await queueMail(ctx, {
      to: email,
      subject: t(locale, 'mail.invite.subject', { site: actor.site.name }),
      text: t(locale, 'mail.invite.text', { site: actor.site.name, days: INVITE_DAYS, link: `${siteOrigin()}/invite/${token}` }),
    })
    return { invite: id }
  },
})

/**
 * What an open invite offers, for the page before accepting (UI.md 6): the site's name, the role, and
 * whether it is for the signed-in address. Only who holds the link can ask; the invited address is not returned.
 */
export const peek = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const user = await currentUser(ctx)
    const invite = await ctx.db.query('invites').withIndex('by_tokenHash', (q) => q.eq('tokenHash', sha256(args.token))).unique()
    if (!invite || invite.acceptedAt !== undefined || invite.expiresAt <= Date.now()) return null
    const site = (await ctx.db.get(invite.site))!
    if (site.deleting) return null
    return { site: site.name, role: invite.role, forYou: !!user.email && normalizeEmail(user.email) === invite.email }
  },
})

/** Marks an invite used and makes the membership; shared by the link flow and the card on "Meine Seiten". */
async function claim(ctx: MutationCtx, user: { id: string }, invite: Doc<'invites'>) {
  await ctx.db.patch(invite._id, { acceptedAt: Date.now() })
  // The UI opens the site next, so the answer names it.
  const siteRow = (await ctx.db.get(invite.site))!
  // A site that is being deleted takes nobody new.
  if (siteRow.deleting) fail('NOT_FOUND', 'errors.inviteNotFound')
  const site = siteRow.slug
  const existing = await ctx.db
    .query('memberships')
    .withIndex('by_user_site', (q) => q.eq('user', user.id).eq('site', invite.site))
    .unique()
  if (existing) return { already: true, site }

  await ctx.db.insert('memberships', {
    site: invite.site,
    user: user.id,
    email: invite.email,
    role: invite.role,
    grants: invite.grants,
  })
  return { already: false, site }
}

const isOpen = (invite: Doc<'invites'>) => invite.acceptedAt === undefined && invite.expiresAt > Date.now()

export const accept = mutation({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const user = await currentUser(ctx)
    if (!user.email) fail('FORBIDDEN', 'errors.signInWithInvitedEmail')
    const invite = await ctx.db.query('invites').withIndex('by_tokenHash', (q) => q.eq('tokenHash', sha256(args.token))).unique()
    if (!invite || !isOpen(invite)) fail('NOT_FOUND', 'errors.inviteNotFound')
    // A wrong email is refused without using up the invite.
    if (normalizeEmail(user.email) !== invite.email) fail('FORBIDDEN', 'errors.inviteForOtherEmail')
    return claim(ctx, user, invite)
  },
})

/**
 * Open invites for the signed-in address, shown as cards on "Meine Seiten". Signing in proves the
 * address, so no link is needed. Only the person's own invites are returned.
 */
export const mine = query({
  args: {},
  handler: async (ctx) => {
    const user = await currentUser(ctx)
    if (!user.email) return []
    const invites = await ctx.db.query('invites').withIndex('by_email', (q) => q.eq('email', normalizeEmail(user.email!))).collect()
    const rows = []
    for (const invite of invites.filter(isOpen)) {
      const site = await ctx.db.get(invite.site)
      if (site && !site.deleting) rows.push({ invite: invite._id, site: site.name, role: invite.role, expiresAt: invite.expiresAt })
    }
    return rows
  },
})

export const acceptMine = mutation({
  args: { invite: v.string() },
  handler: async (ctx, args) => {
    const user = await currentUser(ctx)
    const id = ctx.db.normalizeId('invites', args.invite)
    const invite = id ? await ctx.db.get(id) : null
    // Another person's invite looks the same as a missing one: nothing leaks.
    if (!user.email || !invite || invite.acceptedAt !== undefined || normalizeEmail(user.email) !== invite.email) {
      fail('NOT_FOUND', 'errors.inviteNotFound')
    }
    if (invite.expiresAt <= Date.now()) fail('NOT_FOUND', 'errors.inviteExpired')
    return claim(ctx, user, invite)
  },
})

export const revoke = mutation({
  args: { site: v.string(), invite: v.string() },
  handler: async (ctx, args) => {
    const actor = await actorFor(ctx, args.site)
    const normalized = ctx.db.normalizeId('invites', args.invite)
    const invite = normalized ? await ctx.db.get(normalized) : null
    if (!invite || invite.site !== actor.site._id || invite.acceptedAt !== undefined) fail('NOT_FOUND', 'errors.inviteNotFound')
    mayInvite(actor, invite.role)
    await ctx.db.delete(invite._id)
    return { invite: invite._id }
  },
})

/** Sign-up gate for Better Auth (`beforeUserCreate`): only admin addresses and pending invitees may create an account. */
export const mayJoin = internalQuery({
  args: { email: v.string() },
  handler: async (ctx, args): Promise<boolean> => {
    const email = normalizeEmail(args.email)
    if (adminEmails().includes(email)) return true
    const invites = await ctx.db.query('invites').withIndex('by_email', (q) => q.eq('email', email)).collect()
    return invites.some((invite) => invite.acceptedAt === undefined && invite.expiresAt > Date.now())
  },
})
