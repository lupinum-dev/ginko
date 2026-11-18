// Demo content for a hosted demo site (Phase 10): fills a site that nobody has edited yet with a
// corpus (contracts/<site>/data.json) and invites the demo people (`.test` addresses, whose codes
// stay in the outbox, SPEC 10). It never overwrites edited content: a site with a collection entry
// or an edited entry is refused. Internal, so only a holder of the deployment's deploy or admin key
// reaches it (`npx convex run demo:fill`). `dropGuests` ends the access a demo gave (demo reset).
import { v } from 'convex/values'
import { internalMutation } from './_generated/server'
import { fail } from './lib/access'
import { insertCorpus, invitePeople, type Corpus } from './lib/corpus'
import { dropTrees } from './lib/trees'

export const fill = internalMutation({
  args: {
    site: v.string(),
    corpus: v.any(),
    people: v.array(v.object({ email: v.string(), role: v.union(v.literal('owner'), v.literal('staff')), grants: v.array(v.string()) })),
  },
  handler: async (ctx, args) => {
    const site = await ctx.db.query('sites').withIndex('by_slug', (q) => q.eq('slug', args.site)).unique()
    if (!site) fail('SITE_NOT_FOUND', 'errors.siteNotBootstrapped')
    for (const person of args.people) {
      if (!/\.test$/i.test(person.email.trim())) fail('INVALID', 'errors.demoEmailMustBeTest', { email: person.email })
    }
    const entries = await ctx.db.query('entries').withIndex('by_site_brick_order', (q) => q.eq('site', site._id)).collect()
    if (entries.some((e) => e.kind === 'item' || e.rev > 1)) {
      fail('FORBIDDEN', 'errors.siteAlreadyHasContent')
    }
    // The first release made the singles from their defaults; untouched, the corpus takes their place.
    for (const entry of entries) {
      await dropTrees(ctx, entry._id)
      await ctx.db.delete(entry._id)
    }
    const { count } = await insertCorpus(ctx, site, args.corpus as Corpus)
    const links = await invitePeople(ctx, site, args.people, 'demo')
    return { entries: count, links }
  },
})

/**
 * The demo reset's second step (`pnpm templates demo-reset`, after `ops:import --reset`): ends the access of everyone a
 * demo let in. Deletes the site's memberships and open invites whose address does not end in `.test`, and its expired
 * invites. Kept: the `.test` demo people, and the platform admins, who need no membership. Separate from
 * `seed:importClear`, whose local use (`ops:import --reset`) replaces content only. Same guard as that clear: a local
 * backend or the demo platform (GINKO_DEMO=1), never the client platform. Answers counts only: the workflow log of a public
 * repository is readable by anyone, and any part of an address can name a prospect.
 */
export const dropGuests = internalMutation({
  args: { site: v.string() },
  handler: async (ctx, args) => {
    if (process.env.GINKO_LOCAL !== '1' && process.env.GINKO_DEMO !== '1') fail('FORBIDDEN', 'errors.localOrDemoOnly')
    const site = await ctx.db.query('sites').withIndex('by_slug', (q) => q.eq('slug', args.site)).unique()
    if (!site) fail('SITE_NOT_FOUND', 'errors.siteMissing')
    // A membership without an address (made before memberships stored one) cannot be proven a demo person: it goes.
    const isGuest = (email: string | undefined) => !email || !/\.test$/i.test(email)
    let members = 0
    let invites = 0
    for (const member of await ctx.db.query('memberships').withIndex('by_site', (q) => q.eq('site', site._id)).collect()) {
      if (!isGuest(member.email)) continue
      await ctx.db.delete(member._id)
      members++
    }
    const now = Date.now()
    for (const invite of await ctx.db.query('invites').withIndex('by_site', (q) => q.eq('site', site._id)).collect()) {
      const open = invite.acceptedAt === undefined && invite.expiresAt > now
      // Accepted invites are history of a membership; only open guest invites and expired ones go.
      if (invite.acceptedAt !== undefined || (open && !isGuest(invite.email))) continue
      if (open) invites++
      await ctx.db.delete(invite._id)
    }
    return { members, invites }
  },
})
