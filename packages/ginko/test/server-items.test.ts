// getGinkoItems (runtime/server/items.ts): the entries a site's own server route reads, filtered like a page's list.
// '#ginko/schema' is the restaurant config (test shim); the bundles are stubbed, the clock is fixed.
import { afterAll, beforeAll, expect, test, vi } from 'vitest'
import type { GinkoPublicConfig } from '../src/nuxt/runtime/shared.ts'

const config = { site: 'restaurant', locales: ['de', 'en'], mainLocale: 'de', timeZone: 'Europe/Vienna' } as GinkoPublicConfig
const event = (slug: string, from: string, to: string) => ({ id: `events/${slug}`, fallback: [], urls: { de: `/veranstaltungen/${slug}` }, data: { title: slug, slug, when: { from, to } } })

vi.mock('nuxt/server', () => ({
  createError: (input: { statusCode: number; statusMessage: string }) => Object.assign(new Error(input.statusMessage), input),
  useRuntimeConfig: () => ({ public: { ginko: config } }),
}))
vi.mock('../src/nuxt/runtime/server/bundles.ts', () => ({
  loadServerBundles: async () => ({
    de: {
      locale: 'de',
      mainLocale: 'de',
      bricks: { events: { kind: 'collection', items: [event('vorbei', '2026-10-01', '2026-10-14'), event('heute', '2026-10-15', '2026-10-15'), event('bald', '2026-11-01', '2026-11-02')] } },
    },
  }),
}))

const { getGinkoItems } = await import('../src/nuxt/runtime/server/items.ts')
const request = {} as Parameters<typeof getGinkoItems>[0]

beforeAll(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-15T10:00:00Z'))
})
afterAll(() => vi.useRealTimers())

// Wrong behaviour caught: a feed or calendar file that still lists an event (or a campaign) after its last day.
test('an entry past its visible date is left out; the others keep their order and their address', async () => {
  const items = await getGinkoItems(request, 'events', 'de')
  expect(items.map((item) => [item.id, item.url])).toEqual([['events/heute', '/veranstaltungen/heute'], ['events/bald', '/veranstaltungen/bald']])
})

test('a language the site does not have answers 404', async () => {
  await expect(getGinkoItems(request, 'events', 'fr')).rejects.toMatchObject({ statusCode: 404 })
})
