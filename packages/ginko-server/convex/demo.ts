// Demo content for a hosted demo site (Phase 10): fills a site that nobody has edited yet with a
// corpus (contracts/<site>/data.json) and invites the demo people (`.test` addresses, whose codes
// stay in the outbox, SPEC 10). It never overwrites edited content: a site with a collection entry
// or an edited entry is refused. Internal, so only a holder of the deployment's deploy or admin key
// reaches it (`npx convex run demo:fill`).
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
