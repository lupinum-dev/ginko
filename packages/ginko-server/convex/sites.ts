// Site queries for the UI and the admin-only creation of a site (SPEC 4.2, 10).
import { isCurrency, isLocale, isTimeZone, isVisible, labelOf as labelIn, MAX_LOCALES, ordered, todayIn, weekInfoOf, type Schema } from '@lupinum/ginko/internal'
import { v } from 'convex/values'
import { internal } from './_generated/api'
import type { Doc } from './_generated/dataModel'
import { internalMutation, mutation, query, type MutationCtx, type QueryCtx } from './_generated/server'
import { actorFor, currentUser, fail, memberOf, type Actor } from './lib/access'
import { NAME_MAX, SLUG } from './lib/input'
import { isReminded, reminderBricks } from './lib/reminders'
import { statesOf } from './lib/status'
import { isFetchableSiteUrl } from './lib/siteUrl'
import { leafStatus } from './lib/translation'
import { titleOf } from './lib/list'
import type { Data } from './lib/content'

/**
 * The sites the signed-in user may open, with their role. Admins see every site. A site being deleted is listed for
 * owners and admins only (they can cancel), marked `deleting`. `weekly`: the weekly reminder can mail this person about
 * the site, for a weekly task or a status line (reminders.ts; it mails members only). The order is the database's; the Studio sorts by name.
 */
export const mine = query({
  args: {},
  handler: async (ctx) => {
    const user = await currentUser(ctx)
    const memberships = await ctx.db.query('memberships').withIndex('by_user_site', (q) => q.eq('user', user.id)).collect()
    const row = (site: Doc<'sites'>, role: 'admin' | Doc<'memberships'>['role']) => {
      const member = memberships.find((m) => m.site === site._id)
      const weekly = !!member && reminderBricks(site.schema as Schema).some(({ refs }) => isReminded(member, refs))
      return { slug: site.slug, name: site.name, url: site.url, role, deleting: !!site.deleting, weekly }
    }
    const admin = await ctx.db.query('admins').withIndex('by_user', (q) => q.eq('user', user.id)).unique()
    if (admin) return (await ctx.db.query('sites').collect()).map((site) => row(site, 'admin'))
    const sites = await Promise.all(memberships.map((member) => ctx.db.get(member.site)))
    return memberships.flatMap((member, index) => {
      const site = sites[index]
      return site && (!site.deleting || member.role === 'owner') ? [row(site, member.role)] : []
    })
  },
})

/**
 * The status lines of Today (UI.md 3) for the bricks this person has a task on, in schema order: each brick's line
 * (`status` on the brick, or the drafts of a drafts collection) and whether its section is due. Bricks with neither are
 * left out. Staff count only their own drafts.
 */
export const today = query({
  args: { site: v.string() },
  handler: async (ctx, args) => {
    const actor = await actorFor(ctx, args.site)
    const schema = actor.site.schema as Schema
    const staff = actor.role === 'staff'
    const keys = ordered(schema.bricks).filter(([key, brick]) => (brick.tasks ?? []).some((task) => !staff || actor.grants.includes(`${key}.${task.id}`))).map(([key]) => key)
    const states = await statesOf(ctx, actor.site, keys, todayIn(schema.timeZone), staff ? actor.user.id : undefined)
    return states.filter((state) => state.line || state.due)
  },
})

/** Days between the start of a site deletion and the hard delete. */
export const DELETION_DAYS = 7

/** Owner or admin of the site, also while it is being deleted. Anyone else (and an unknown site) gets FORBIDDEN as everywhere. */
async function deletionActor(ctx: QueryCtx, slug: string): Promise<Actor> {
  const user = await currentUser(ctx)
  const site = await ctx.db.query('sites').withIndex('by_slug', (q) => q.eq('slug', slug)).unique()
  const actor = site ? await memberOf(ctx, site, user, { deleting: true }) : null
  if (!actor) fail('FORBIDDEN', 'errors.noAccess')
  if (actor.role === 'staff') fail('FORBIDDEN', 'errors.ownersOnly')
  return actor
}

/** When the site will be deleted (ms) and its name, for the banner; null when no deletion is running or the caller may not cancel it. */
export const deletion = query({
  args: { site: v.string() },
  handler: async (ctx, args) => {
    const user = await currentUser(ctx)
    const site = await ctx.db.query('sites').withIndex('by_slug', (q) => q.eq('slug', args.site)).unique()
    const actor = site?.deleting ? await memberOf(ctx, site, user, { deleting: true }) : null
    return actor && actor.role !== 'staff' ? { name: actor.site.name, at: actor.site.deleting!.at } : null
  },
})

/**
 * Starts the deletion of a site (GDPR): confirmed by its address, owners and admins only. From now on nobody opens the site
 * but to cancel, the public bundle answers as for an unknown site and keys stop working; `siteDeletion.purge` removes
 * everything after `DELETION_DAYS` days.
 */
export const startDeletion = mutation({
  args: { site: v.string(), confirm: v.string() },
  handler: async (ctx, args) => {
    const actor = await deletionActor(ctx, args.site)
    if (args.confirm !== actor.site.slug) fail('INVALID', 'errors.deleteSiteConfirm')
    if (actor.site.deleting) return { at: actor.site.deleting.at }
    const at = Date.now() + DELETION_DAYS * 24 * 60 * 60 * 1000
    const job = await ctx.scheduler.runAt(at, internal.siteDeletion.purge, { site: actor.site._id })
    await ctx.db.patch(actor.site._id, { deleting: { at, job } })
    return { at }
  },
})

/** Stops a running site deletion; owners and admins only. */
export const cancelDeletion = mutation({
  args: { site: v.string() },
  handler: async (ctx, args) => {
    const actor = await deletionActor(ctx, args.site)
    if (actor.site.deleting) {
      await ctx.scheduler.cancel(actor.site.deleting.job)
      await ctx.db.patch(actor.site._id, { deleting: undefined })
    }
    return null
  },
})

/**
 * One site's settings and counters with its schema, and the caller's own role and grants: what every Studio page
 * reads. No entries: each page reads the ones it shows (entries.list, get, single, titles, ofBricks), so a save
 * does not send the whole site to every open tab. `refreshToken` is never returned.
 */
export const meta = query({
  args: { site: v.string() },
  handler: async (ctx, args) => {
    const actor = await actorFor(ctx, args.site)
    const site = actor.site
    return {
      site: {
        slug: site.slug,
        name: site.name,
        url: site.url,
        previewOrigins: site.previewOrigins,
        schema: site.schema,
        schemaRev: site.schemaRev,
        contentRev: site.contentRev,
        entryCount: site.entryCount,
        bytes: site.bytes,
        /** Whether the trash holds removed entries (Alles bearbeiten links to it). From the trash's byte counter, so no read of the trash; removed entries of retired bricks count too. */
        hasTrash: (site.trashBytes ?? 0) > 0,
        release: site.release,
        /** The site setting for agent review (SPEC 17); null: the config's `agents.review` decides. */
        agentReview: site.agentReview ?? null,
        /** When the live site last proved it shows the current revision (an urgent refresh that every page confirmed); null: never. */
        lastRefreshAt: site.lastRefreshAt ?? null,
      },
      role: actor.role,
      grants: actor.grants,
    }
  },
})

/** Switches review of agent writes for the whole site (SPEC 17); `null` hands the decision back to the config. Owners and admins only. */
export const setAgentReview = mutation({
  args: { site: v.string(), review: v.union(v.boolean(), v.null()) },
  handler: async (ctx, args) => {
    const actor = await actorFor(ctx, args.site)
    if (actor.role === 'staff') fail('FORBIDDEN', 'errors.ownersOnly')
    await ctx.db.patch(actor.site._id, { agentReview: args.review ?? undefined })
    return { review: args.review }
  },
})

/** Creates a site with an empty schema (SPEC 2.1 shape, no bricks yet); its first release brings the bricks. */
async function insertSite(ctx: MutationCtx, args: { slug: string; name: string; url: string; timeZone?: string; locales?: string[]; currency?: string }) {
  if (!SLUG.test(args.slug)) fail('INVALID', 'errors.siteAddressFormat')
  const name = args.name.trim()
  if (!name) fail('INVALID', 'errors.nameMissing')
  if (name.length > NAME_MAX) fail('INVALID', 'errors.nameTooLong', { nameMax: NAME_MAX })
  let url: URL | undefined
  try {
    url = new URL(args.url)
  } catch {
    // fails below
  }
  if (url?.protocol !== 'http:' && url?.protocol !== 'https:') fail('INVALID', 'errors.siteAddressNotUrl')
  if (!isFetchableSiteUrl(args.url, process.env.GINKO_LOCAL === '1')) fail('INVALID', 'errors.siteUrlNotAllowed')
  // Defaults stay Vienna, German, EUR; the first release may still change them while the site has no bricks.
  const timeZone = args.timeZone ?? 'Europe/Vienna'
  const locales = args.locales ?? ['de']
  const currency = args.currency ?? 'EUR'
  if (!isTimeZone(timeZone)) fail('INVALID', 'errors.siteTimezoneInvalid', { timeZone })
  if (locales.length < 1 || locales.length > MAX_LOCALES || !locales.every(isLocale) || new Set(locales).size !== locales.length) fail('INVALID', 'errors.siteLocalesInvalid', { max: MAX_LOCALES })
  if (!isCurrency(currency)) fail('INVALID', 'errors.siteCurrencyInvalid', { currency })
  const existing = await ctx.db.query('sites').withIndex('by_slug', (q) => q.eq('slug', args.slug)).unique()
  if (existing) fail('SLUG_TAKEN', 'errors.addressTaken')

  const schema = {
    site: args.slug,
    name,
    url: args.url,
    timeZone,
    locales,
    currency,
    // Every stored schema has `week` (the hourly reminder sweep reads it for every site); the first release replaces it.
    week: weekInfoOf(locales[0]!),
    pages: {},
    bricks: {},
    migrations: [],
    retired: {},
  }
  await ctx.db.insert('sites', {
    slug: args.slug,
    name,
    url: args.url,
    previewOrigins: [],
    schema,
    schemaRev: 1,
    contentRev: 1,
    entryCount: 0,
    bytes: 0,
    trashBytes: 0,
    treeBytes: 0,
    release: null,
  })
}

/** Admin only, from the platform UI. */
export const create = mutation({
  args: { slug: v.string(), name: v.string(), url: v.string(), timeZone: v.optional(v.string()), locales: v.optional(v.array(v.string())), currency: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const user = await currentUser(ctx)
    const admin = await ctx.db.query('admins').withIndex('by_user', (q) => q.eq('user', user.id)).unique()
    if (!admin) fail('FORBIDDEN', 'errors.onlyAdminsCreateSites')
    await insertSite(ctx, args)
    return { slug: args.slug }
  },
})

/**
 * The first site of a new deployment, before anyone can sign in (`npx convex run sites:bootstrap`).
 * Internal: only a holder of the deployment's admin or deploy key reaches it.
 */
export const bootstrap = internalMutation({
  args: { slug: v.string(), name: v.string(), url: v.string() },
  handler: async (ctx, args) => {
    await insertSite(ctx, args)
    return { slug: args.slug }
  },
})

/**
 * The site's Vercel bypass token (`NUXT_GINKO_REVALIDATE_TOKEN` in the site), so "urgent refresh" can
 * regenerate its pages (SPEC 4.4). Set once per deploy setup; never returned by any query.
 * Internal: deploy or admin key only (`npx convex run sites:setRefreshToken`).
 */
export const setRefreshToken = internalMutation({
  args: { slug: v.string(), token: v.string() },
  handler: async (ctx, args) => {
    const site = await ctx.db.query('sites').withIndex('by_slug', (q) => q.eq('slug', args.slug)).unique()
    if (!site) fail('SITE_NOT_FOUND', 'errors.siteMissing')
    if (args.token.length < 32) fail('INVALID', 'errors.tokenTooShort')
    await ctx.db.patch(site._id, { refreshToken: args.token })
    return { slug: args.slug }
  },
})

/** The most entries the translation overview lists; the counts stay complete beyond it. */
const TRANSLATION_ROWS = 200

/**
 * Translation status (SPEC 4.2): per brick and per language other than the main one, how many entries
 * have every text (`ok`), at least one missing text (`missing`), or only outdated ones (`outdated`).
 * It uses the rule of the bundle (`resolveEntry`), so it matches what ginko_read reports. It counts what the
 * website shows: live entries and singles, not drafts, and no entry whose date has passed (`isVisible`, as the
 * site's listings). `entries` lists the entries with a gap for the Studio's overview ("Übersetzungen"), by
 * brick in config order and then the site's order, at most TRANSLATION_ROWS (`truncated`): the title (null for
 * a single and an untitled entry: the Studio shows the area), how many texts are missing or outdated, and
 * whether the gap keeps the page off the website in that language (`hidden`). Titles of planned weeks are in
 * `language`. Any member may read; staff get the areas of their tasks (as in Alles bearbeiten), so the list
 * and the count cover the same entries.
 */
export const translationStatus = query({
  args: { site: v.string(), language: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const actor = await actorFor(ctx, args.site)
    const schema = actor.site.schema as Schema
    const foreign = schema.locales.slice(1)
    const bricks = []
    const entries: { brick: string; entry: string; title: string | null; locale: string; missing: number; outdated: number; hidden: boolean }[] = []
    let truncated = false
    const today = todayIn(schema.timeZone)
    const opens = (key: string, tasks: readonly { id: string }[] = []) => actor.role !== 'staff' || tasks.some((t) => actor.grants.includes(`${key}.${t.id}`))
    for (const [key, def] of ordered(schema.bricks)) {
      if (def.retired || !opens(key, def.tasks)) continue
      const rows = (await ctx.db.query('entries').withIndex('by_site_brick_order', (q) => q.eq('site', actor.site._id).eq('brick', key)).collect())
        .filter((row) => !row.deletedAt && row.state !== 'draft' && isVisible(def, row.data as Data, today))
      const locales: Record<string, { missing: number; outdated: number; ok: number }> = {}
      for (const locale of foreign) locales[locale] = { missing: 0, outdated: 0, ok: 0 }
      for (const row of rows) {
        for (const locale of foreign) {
          const status = leafStatus(schema, key, row, locale)
          const out = locales[locale]!
          // One count per entry: a missing text outweighs an outdated one.
          if (status.missing.length) out.missing += 1
          else if (status.outdated.length) out.outdated += 1
          else out.ok += 1
          if (!status.missing.length && !status.outdated.length) continue
          if (entries.length >= TRANSLATION_ROWS) { truncated = true; continue }
          entries.push({
            brick: key, entry: row._id, title: def.kind === 'single' ? null : titleOf(schema, def, row.data as Data, args.language),
            locale, missing: status.missing.length, outdated: status.outdated.length, hidden: status.page === 'hidden',
          })
        }
      }
      bricks.push({ brick: key, label: labelIn(def.label, schema.locales[0]!, schema.locales[0]!), kind: def.kind, locales })
    }
    return { main: schema.locales[0]!, locales: foreign, bricks, entries, truncated }
  },
})

/**
 * The areas of the site as the Studio lists them (Content overview, area list): per brick in config order the number
 * of entries (drafts included, removed ones not), drafts, ended entries (not visible today), open translations (one
 * per entry and foreign language with a missing or outdated text, counted like `translationStatus`) and when its
 * content last changed. Staff see the bricks of their tasks only, like `translationStatus`. One read per brick.
 */
export const areas = query({
  args: { site: v.string() },
  handler: async (ctx, args) => {
    const actor = await actorFor(ctx, args.site)
    const schema = actor.site.schema as Schema
    const foreign = schema.locales.slice(1)
    const today = todayIn(schema.timeZone)
    const opens = (key: string, tasks: readonly { id: string }[] = []) => actor.role !== 'staff' || tasks.some((t) => actor.grants.includes(`${key}.${t.id}`))
    const out: { brick: string; kind: 'single' | 'collection'; count: number; drafts: number; ended: number; translations: number; changedAt: number | null }[] = []
    for (const [key, def] of ordered(schema.bricks)) {
      if (def.retired || !opens(key, def.tasks)) continue
      const rows = (await ctx.db.query('entries').withIndex('by_site_brick_order', (q) => q.eq('site', actor.site._id).eq('brick', key)).collect())
        .filter((row) => !row.deletedAt)
      let drafts = 0, ended = 0, translations = 0, changedAt: number | null = null
      for (const row of rows) {
        const at = row.contentAt ?? row._creationTime
        if (changedAt === null || at > changedAt) changedAt = at
        if (row.state === 'draft') { drafts += 1; continue }
        if (!isVisible(def, row.data as Data, today)) { ended += 1; continue }
        for (const locale of foreign) {
          const status = leafStatus(schema, key, row, locale)
          if (status.missing.length || status.outdated.length) translations += 1
        }
      }
      out.push({ brick: key, kind: def.kind, count: rows.length, drafts, ended, translations, changedAt })
    }
    return out
  },
})

/**
 * One-time cleanup (internals/migrations.md): removes the unused `orderRevs` from every site. Running it again is safe.
 * Internal: `npx convex run sites:dropOrderRevs`.
 */
export const dropOrderRevs = internalMutation({
  args: {},
  handler: async (ctx) => {
    let cleared = 0
    for (const site of await ctx.db.query('sites').collect()) {
      if (site.orderRevs === undefined) continue
      await ctx.db.patch(site._id, { orderRevs: undefined })
      cleared++
    }
    return { cleared }
  },
})
