// A person's own settings (SPEC 10). Not tied to a site: one switch for all their sites.
import { v } from 'convex/values'
import { mutation, query } from './_generated/server'
import { currentUser, fail } from './lib/access'
import { isLocale } from './lib/i18n'

/** Reminder mail is on unless the person switched it off. `locale` is null until they chose a language. */
export const settings = query({
  args: {},
  handler: async (ctx) => {
    const user = await currentUser(ctx)
    const row = await ctx.db.query('userSettings').withIndex('by_user', (q) => q.eq('user', user.id)).unique()
    return { remindByMail: row?.remindByMail ?? true, locale: row?.locale ?? null }
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
