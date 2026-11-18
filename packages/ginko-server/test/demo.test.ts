// demo:fill (Phase 10): demo content goes only into a site nobody has edited, never over real content.
import { afterEach, expect, it, vi } from 'vitest'
import restaurant from '../../../sites/restaurant/ginko.config.ts'
import corpus from '../../../contracts/restaurant/data.json' with { type: 'json' }
import { createPlatform } from '../../../packages/ginko/src/cli/platform.ts'
import { release } from '../../../packages/ginko/src/cli/release.ts'
import { components, internal } from '../convex/_generated/api'
import { errorOf, setup } from './setup'

afterEach(() => vi.unstubAllEnvs())

const people = [{ email: 'wirtin@example.test', role: 'owner' as const, grants: [] }]

it('fills a freshly released site once, with .test people only, and refuses a site with content', async () => {
  const s = await setup()
  await s.t.mutation(internal.sites.bootstrap, { slug: 'linde', name: 'Gasthaus zur Linde', url: 'https://ginko-demo-restaurant.vercel.app' })
  const { key } = await s.t.mutation(internal.release.bootstrapKey, { site: 'linde', label: 'CI', scopes: ['release'] })
  const platform = createPlatform({ url: 'https://platform.test', key, fetch: async (url, init) => { const { pathname, search } = new URL(url); return s.t.fetch(pathname + search, init) } })
  await release({ config: { ...restaurant, site: 'linde' }, commit: 'c1', platform, branchHead: async () => 'c1', sleep: async () => undefined, log: () => undefined })

  expect(await errorOf(s.t.mutation(internal.demo.fill, { site: 'linde', corpus, people: [{ email: 'echt@example.com', role: 'owner', grants: [] }] }))).toMatchObject({ code: 'INVALID' })
  const filled = await s.t.mutation(internal.demo.fill, { site: 'linde', corpus, people })
  expect(filled.entries).toBeGreaterThan(10)
  expect(filled.links).toHaveLength(1)
  // Filled once, the site has content: a second fill, or a fill of the seeded restaurant, is refused.
  expect(await errorOf(s.t.mutation(internal.demo.fill, { site: 'linde', corpus, people }))).toMatchObject({ code: 'FORBIDDEN' })
  expect(await errorOf(s.t.mutation(internal.demo.fill, { site: 'restaurant', corpus, people }))).toMatchObject({ code: 'FORBIDDEN' })
})

// Wrong behaviour caught: the local backend keeps one rate-limit bucket per path for everyone, and a bucket only empties
// after 10 s without a request, so a long e2e run got 429 for its 301st Convex token and landed on the sign-in.
it('a local reset empties the rate-limit buckets', async () => {
  const s = await setup()
  vi.stubEnv('GINKO_LOCAL', '1')
  await s.t.mutation(components.betterAuth.adapter.create, { model: 'rateLimit', data: { id: 'rl-token', key: 'no-trusted-ip|/convex/token', count: 300, lastRequest: Date.now() } })
  await s.t.mutation(internal.seed.reset, { site: 'restaurant', corpus })
  const left = await s.t.query(components.betterAuth.adapter.findMany, { model: 'rateLimit', paginationOpts: { cursor: null, numItems: 10 } })
  expect(left.page).toEqual([])
})

// Wrong behaviour caught: a prospect invited for a demo keeps access after the site's reset; or the reset removes the
// `.test` demo people, touches another site, or runs on the client platform (no GINKO_DEMO).
it('dropGuests removes the members and invites without a .test address of one site, only on the demo platform', async () => {
  const s = await setup()
  const invite = (site: typeof s.site, email: string, expiresAt: number) => ({ site, email, role: 'staff' as const, grants: [], tokenHash: email, invitedBy: 'u-admin', expiresAt })
  const day = 24 * 60 * 60 * 1000
  await s.t.run(async (ctx) => {
    await ctx.db.insert('memberships', { site: s.site, user: 'u-demo', email: 'koch@example.test', role: 'staff', grants: [] })
    await ctx.db.insert('invites', invite(s.site, 'gast@example.org', Date.now() + day))
    await ctx.db.insert('invites', invite(s.site, 'neu@example.test', Date.now() + day))
    await ctx.db.insert('invites', invite(s.site, 'alt@example.test', Date.now() - day))
  })
  const emailsOf = (table: 'memberships' | 'invites', site: typeof s.site) =>
    s.t.run(async (ctx) => (await ctx.db.query(table).withIndex('by_site', (q) => q.eq('site', site)).collect()).map((row) => row.email).sort())

  expect((await errorOf(s.t.mutation(internal.demo.dropGuests, { site: 'restaurant' }))).code).toBe('FORBIDDEN')
  expect(await emailsOf('memberships', s.site)).toEqual(['koch@example.com', 'koch@example.test', 'wirtin@example.com'])

  vi.stubEnv('GINKO_DEMO', '1')
  expect(await s.t.mutation(internal.demo.dropGuests, { site: 'restaurant' })).toEqual({ members: 2, invites: 1 })
  expect(await emailsOf('memberships', s.site)).toEqual(['koch@example.test'])
  expect(await emailsOf('invites', s.site)).toEqual(['neu@example.test'])
  // The other site keeps its real-address owner.
  expect(await emailsOf('memberships', s.other)).toEqual(['fremd@example.com'])
})
