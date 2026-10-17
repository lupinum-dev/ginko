// A person's own settings (SPEC 10). Not tied to a site: one switch for all their sites.
import { v } from 'convex/values'
import { components } from './_generated/api'
import { mutation, query } from './_generated/server'
import { currentUser, fail } from './lib/access'
import { isLocale } from './lib/i18n'
import { normalizeEmail } from './members'

/** Reminder mail is on unless the person switched it off. `locale` and `name` are null until they chose one. */
export const settings = query({
  args: {},
  handler: async (ctx) => {
    const user = await currentUser(ctx)
    const row = await ctx.db.query('userSettings').withIndex('by_user', (q) => q.eq('user', user.id)).unique()
    return { remindByMail: row?.remindByMail ?? true, locale: row?.locale ?? null, name: row?.name ?? null }
  },
})

export const PERSON_NAME_MAX = 60

/**
 * The name every team of this person sees instead of their email (`lib/names.ts`), staff included. One per person,
 * set by the person. An empty name removes it, and the teams see the email again.
 */
export const setName = mutation({
  args: { name: v.string() },
  handler: async (ctx, args): Promise<null> => {
    const user = await currentUser(ctx)
    const name = args.name.trim().replace(/\s+/g, ' ')
    if (name.length > PERSON_NAME_MAX) fail('INVALID', 'errors.nameTooLong', { nameMax: PERSON_NAME_MAX })
    const row = await ctx.db.query('userSettings').withIndex('by_user', (q) => q.eq('user', user.id)).unique()
    if (row) await ctx.db.patch(row._id, { name: name || undefined })
    else if (name) await ctx.db.insert('userSettings', { user: user.id, remindByMail: true, name })
    return null
  },
})

export const setRemindByMail = mutation({
  args: { on: v.boolean() },
  handler: async (ctx, args): Promise<null> => {
    const user = await currentUser(ctx)
    const row = await ctx.db.query('userSettings').withIndex('by_user', (q) => q.eq('user', user.id)).unique()
    if (row) await ctx.db.patch(row._id, { remindByMail: args.on })
    else await ctx.db.insert('userSettings', { user: user.id, remindByMail: args.on })
    return null
  },
})

/** The language the Studio showed this person while they have chosen none (for mails only; see schema `seenLocale`). */
export const sawLocale = mutation({
  args: { locale: v.string() },
  handler: async (ctx, args): Promise<null> => {
    const user = await currentUser(ctx)
    if (!isLocale(args.locale)) return null
    const row = await ctx.db.query('userSettings').withIndex('by_user', (q) => q.eq('user', user.id)).unique()
    if (!row) await ctx.db.insert('userSettings', { user: user.id, remindByMail: true, seenLocale: args.locale })
    else if (row.seenLocale !== args.locale) await ctx.db.patch(row._id, { seenLocale: args.locale })
    return null
  },
})

/** The language of the messages and mail this person gets: one of the catalogs in `i18n/`. */
export const setLocale = mutation({
  args: { locale: v.string() },
  handler: async (ctx, args): Promise<null> => {
    const user = await currentUser(ctx)
    if (!isLocale(args.locale)) fail('INVALID', 'errors.languageUnsupported', { locale: args.locale })
    const row = await ctx.db.query('userSettings').withIndex('by_user', (q) => q.eq('user', user.id)).unique()
    if (row) await ctx.db.patch(row._id, { locale: args.locale })
    else await ctx.db.insert('userSettings', { user: user.id, remindByMail: true, locale: args.locale })
    return null
  },
})

/**
 * Deletes the signed-in person's account (GDPR). Refused while they are the last owner of a site that is not
 * already being deleted; the message names the sites. Otherwise it removes their memberships, the invitations to their address,
 * their agent keys, saved views and settings, and the Better Auth user with its sessions and accounts (so they are signed out).
 * Rows that only name them (history, proposals, uploads) stay: the id points to nothing any more, and the Studio shows
 * "Former member" for it (`lib/names.ts`). No name or address is kept.
 */
export const deleteAccount = mutation({
  args: {},
  handler: async (ctx): Promise<null> => {
    const user = await currentUser(ctx)
    const memberships = await ctx.db.query('memberships').withIndex('by_user_site', (q) => q.eq('user', user.id)).collect()

    const blocking: string[] = []
    for (const member of memberships.filter((m) => m.role === 'owner')) {
      const site = await ctx.db.get(member.site)
      if (!site || site.deleting) continue
      const owners = (await ctx.db.query('memberships').withIndex('by_site', (q) => q.eq('site', member.site)).collect()).filter((m) => m.role === 'owner')
      if (owners.length <= 1) blocking.push(site.name)
    }
    if (blocking.length) fail('INVALID', 'errors.lastOwnerOfSites', { sites: blocking.join(', ') }, { sites: blocking })

    for (const member of memberships) await ctx.db.delete(member._id)
    if (user.email) {
      for (const invite of await ctx.db.query('invites').withIndex('by_email', (q) => q.eq('email', normalizeEmail(user.email!))).collect()) await ctx.db.delete(invite._id)
    }
    for (const key of await ctx.db.query('agentKeys').withIndex('by_user', (q) => q.eq('user', user.id)).collect()) await ctx.db.delete(key._id)
    for (const view of await ctx.db.query('views').withIndex('by_user', (q) => q.eq('user', user.id)).collect()) await ctx.db.delete(view._id)
    for (const row of await ctx.db.query('userSettings').withIndex('by_user', (q) => q.eq('user', user.id)).collect()) await ctx.db.delete(row._id)
    for (const row of await ctx.db.query('admins').withIndex('by_user', (q) => q.eq('user', user.id)).collect()) await ctx.db.delete(row._id)

    // The user row cascades to its sessions and accounts (Better Auth schema metadata). Done last: `currentUser` reads it.
    await ctx.runMutation(components.betterAuth.adapter.deleteOne, { model: 'user', where: [{ field: 'id', value: user.id }] })
    return null
  },
})
