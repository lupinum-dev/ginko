// Site queries for the UI and the admin-only creation of a site (SPEC 4.2, 10).
import { isCurrency, isLocale, isTimeZone, labelOf as labelIn, MAX_LOCALES, type Schema } from '@lupinum/ginko/internal'
import { v } from 'convex/values'
import { internalMutation, mutation, query, type MutationCtx } from './_generated/server'
import { actorFor, currentUser, fail } from './lib/access'
import { NAME_MAX, SLUG } from './lib/input'
import { isFetchableSiteUrl } from './lib/siteUrl'
import { leafStatus } from './lib/translation'
import { labelOf } from './entries'
import type { Data } from './lib/content'

/** The sites the signed-in user may open, with their role. Admins see every site. */
export const mine = query({
  args: {},
  handler: async (ctx) => {
    const user = await currentUser(ctx)
    const admin = await ctx.db.query('admins').withIndex('by_user', (q) => q.eq('user', user.id)).unique()
    if (admin) {
      const sites = await ctx.db.query('sites').collect()
      return sites.map((site) => ({ slug: site.slug, name: site.name, url: site.url, role: 'admin' as const }))
    }
    const memberships = await ctx.db.query('memberships').withIndex('by_user_site', (q) => q.eq('user', user.id)).collect()
    const sites = await Promise.all(memberships.map((member) => ctx.db.get(member.site)))
    return memberships.flatMap((member, index) => {
      const site = sites[index]
      return site ? [{ slug: site.slug, name: site.name, url: site.url, role: member.role }] : []
    })
  },
})

/** One site with its schema, its live entries, and the caller's own role and grants. `refreshToken` is never returned. */
export const get = query({
  args: { site: v.string() },
  handler: async (ctx, args) => {
    const actor = await actorFor(ctx, args.site)
    const site = actor.site
    const entries = await ctx.db.query('entries').withIndex('by_site_brick_order', (q) => q.eq('site', site._id)).collect()
    return {
      site: {
        slug: site.slug,
        name: site.name,
        url: site.url,
        previewOrigins: site.previewOrigins,
        schema: site.schema,
        schemaRev: site.schemaRev,
        contentRev: site.contentRev,
        orderRevs: site.orderRevs,
        entryCount: site.entryCount,
        bytes: site.bytes,
        release: site.release,
        /** The site setting for agent review (SPEC 17); null: the config's `agents.review` decides. */
        agentReview: site.agentReview ?? null,
        /** When the live site last proved it shows the current revision (an urgent refresh that every page confirmed); null: never. */
        lastRefreshAt: site.lastRefreshAt ?? null,
      },
      role: actor.role,
      grants: actor.grants,
      entries: entries.filter((entry) => entry.deletedAt === undefined),
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
async function insertSite(ctx: MutationCtx, args: { slug: string; name: string; url: string; timezone?: string; locales?: string[]; currency?: string }) {
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
  const timezone = args.timezone ?? 'Europe/Vienna'
  const locales = args.locales ?? ['de']
  const currency = args.currency ?? 'EUR'
  if (!isTimeZone(timezone)) fail('INVALID', 'errors.siteTimezoneInvalid', { timezone })
  if (locales.length < 1 || locales.length > MAX_LOCALES || !locales.every(isLocale) || new Set(locales).size !== locales.length) fail('INVALID', 'errors.siteLocalesInvalid', { max: MAX_LOCALES })
  if (!isCurrency(currency)) fail('INVALID', 'errors.siteCurrencyInvalid', { currency })
  const existing = await ctx.db.query('sites').withIndex('by_slug', (q) => q.eq('slug', args.slug)).unique()
  if (existing) fail('SLUG_TAKEN', 'errors.addressTaken')

  const schema = {
    site: args.slug,
    name,
    url: args.url,
    timezone,
    locales,
    currency,
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
    orderRevs: {},
    entryCount: 0,
    bytes: 0,
    release: null,
  })
}

/** Admin only, from the platform UI. */
export const create = mutation({
  args: { slug: v.string(), name: v.string(), url: v.string(), timezone: v.optional(v.string()), locales: v.optional(v.array(v.string())), currency: v.optional(v.string()) },
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

/** Entries named per brick and language in the translation status; the totals always count all. */
export const TRANSLATION_LIST_MAX = 200

/**
 * Translation status (SPEC 4.2): per brick and per language other than the main one, how many entries
 * have every text (`ok`), at least one missing text (`missing`), or only outdated ones (`outdated`),
 * and which texts. It uses the rule of the bundle (`resolveEntry`), so it matches what ginko_read
 * reports; like the bundle it counts live entries and singles, not drafts. Any member may read.
 */
export const translationStatus = query({
  args: { site: v.string() },
  handler: async (ctx, args) => {
    const actor = await actorFor(ctx, args.site)
    const schema = actor.site.schema as Schema
    const foreign = schema.locales.slice(1)
    const bricks = []
    for (const [key, def] of Object.entries(schema.bricks)) {
      if (def.retired) continue
      const rows = (await ctx.db.query('entries').withIndex('by_site_brick_order', (q) => q.eq('site', actor.site._id).eq('brick', key)).collect())
        .filter((row) => !row.deletedAt && row.state !== 'draft')
      const locales: Record<string, { missing: number; outdated: number; ok: number; entries: { entry: string; label: string; missing: string[]; outdated: string[] }[]; truncated: boolean }> = {}
      for (const locale of foreign) {
        const out = { missing: 0, outdated: 0, ok: 0, entries: [] as { entry: string; label: string; missing: string[]; outdated: string[] }[], truncated: false }
        for (const row of rows) {
          const status = leafStatus(schema, key, row, locale)
          if (!status.missing.length && !status.outdated.length) { out.ok += 1; continue }
          // One count per entry: a missing text outweighs an outdated one.
          if (status.missing.length) out.missing += 1
          else out.outdated += 1
          if (out.entries.length >= TRANSLATION_LIST_MAX) { out.truncated = true; continue }
          out.entries.push({ entry: row._id, label: labelOf(schema, key, row.data as Data), missing: status.missing, outdated: status.outdated })
        }
        locales[locale] = out
      }
      bricks.push({ brick: key, label: labelIn(def.label, schema.locales[0]!, schema.locales[0]!), kind: def.kind, locales })
    }
    return { main: schema.locales[0]!, locales: foreign, bricks }
  },
})
