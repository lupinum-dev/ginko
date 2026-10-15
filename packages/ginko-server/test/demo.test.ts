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
