// `/__ginko/search/<locale>.json` (runtime/server/search.ts) on a site with platform bricks: the index is built from
// the bundle the pages read. '#ginko/schema' is the restaurant config (test shim); the bundle is the restaurant's
// platform contract (Markdown inline, as the platform sends it); the clock is fixed.
import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, expect, test, vi } from 'vitest'
import type { GinkoPublicConfig } from '../src/nuxt/runtime/shared.ts'
import { loadIndex, search, type SearchIndexJson } from '../src/search.ts'

const config = { site: 'restaurant', locales: ['de', 'en'], mainLocale: 'de', languages: { de: 'de-AT', en: 'en-GB' }, timeZone: 'Europe/Vienna', sources: { platform: true, files: false } } satisfies Partial<GinkoPublicConfig>
const bundle = JSON.parse(readFileSync(new URL('../../../contracts/restaurant/bundle.format3.de.json', import.meta.url), 'utf8'))
const headers = new Headers()

vi.mock('nuxt/server', () => ({
  createError: (input: { statusCode: number; statusMessage: string }) => Object.assign(new Error(input.statusMessage), input),
  defineEventHandler: (handler: unknown) => handler,
  getRouterParam: (event: { file: string }) => event.file,
  useRuntimeConfig: () => ({ public: { ginko: config } }),
}))
vi.mock('#ginko/search', () => ({ default: {} }))
vi.mock('../src/nuxt/runtime/server/markdown-trees.ts', () => ({ markdownTrees: new Map() }))
vi.mock('../src/nuxt/runtime/server/bundles.ts', () => ({ loadServerBundles: async () => ({ de: bundle }) }))

const { default: handler } = await import('../src/nuxt/runtime/server/search.ts')
const request = (file: string) => (handler as unknown as (event: unknown) => Promise<SearchIndexJson>)({ file, res: { headers } })

beforeAll(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-20T10:00:00Z'))
})
afterAll(() => vi.useRealTimers())

// Wrong behaviour caught: a page that lives on the platform is missing from the site search (the index held only file
// bricks), or a past event is still found after its page left the site.
test('finds the published platform entries that are still on the site, and none past their date', async () => {
  const index = await loadIndex(await request('de.json'))
  expect(search(index, 'Gansl').map((hit) => hit.url)).toEqual(['/veranstaltungen/martini-gansl'])
  expect(search(index, 'Kamptal')).toEqual([]) // the wine evening was on 16 October
  expect(headers.get('x-ginko-rev')).toBe(`${bundle.schemaRev}.${bundle.contentRev}`)
})

test('a language the site does not have answers 404', async () => {
  await expect(request('fr.json')).rejects.toMatchObject({ statusCode: 404 })
})
