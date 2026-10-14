// demo:fill (Phase 10): demo content goes only into a site nobody has edited, never over real content.
import { expect, it } from 'vitest'
import restaurant from '../../../sites/restaurant/ginko.config.ts'
import corpus from '../../../contracts/restaurant/data.json' with { type: 'json' }
import { createPlatform } from '../../../packages/ginko/src/cli/platform.ts'
import { release } from '../../../packages/ginko/src/cli/release.ts'
import { internal } from '../convex/_generated/api'
import { errorOf, setup } from './setup'

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
