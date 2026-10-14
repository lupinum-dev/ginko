// The site route that serves the markdown trees of platform bricks on a client navigation (runtime/server/platform-md.ts).
// The rev in its path comes from the visitor's URL; the platform is stubbed with the restaurant contract bundle (rev 1.1).
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { afterEach, expect, test, vi } from 'vitest'
import type { GinkoPublicConfig } from '../src/nuxt/runtime/shared.ts'

const config = { site: 'restaurant', platform: 'https://platform.test', locales: ['de', 'en'] } as GinkoPublicConfig

vi.mock('nuxt/server', () => ({
  defineEventHandler: <T>(handler: T) => handler,
  getRequestURL: (event: { path: string }) => new URL(event.path, 'https://site.test'),
  createError: (input: { statusCode: number; statusMessage: string }) => Object.assign(new Error(input.statusMessage), input),
  useRuntimeConfig: () => ({ public: { ginko: config }, ginkoRevalidateToken: 'site-token' }),
}))

const { default: handler } = await import('../src/nuxt/runtime/server/platform-md.ts')
const bundle = readFileSync(fileURLToPath(new URL('../../../contracts/restaurant/bundle.format3.de.json', import.meta.url)), 'utf8')
const get = (rev: string) => (handler as unknown as (event: { path: string }) => Promise<{ nodes: unknown[] }>)({ path: `/__ginko/platform/de/${rev}/md/events/sommerfest/description.json` })
  .then((tree) => ({ status: 200, nodes: tree.nodes.length > 0 }), (error: { statusCode: number; message: string }) => ({ status: error.statusCode, message: error.message }))

afterEach(() => vi.unstubAllGlobals())

// Wrong behaviour caught: a made-up newer rev evicted the good copy and answered 503, and every repeat made the
// site fetch a whole bundle from the platform under its own token.
test('a rev the platform has not reached is a 404 that keeps the copy and is not fetched again', async () => {
  const fetch = vi.fn(async (url: string | URL | Request) => String(url).includes('minRev=999999.1')
    ? new Response('{"code":"STALE"}', { status: 409 })
    : new Response(bundle, { status: 200 }))
  vi.stubGlobal('fetch', fetch)
  expect(await get('1.1')).toEqual({ status: 200, nodes: true })
  expect(await get('999999.1')).toEqual({ status: 404, message: 'Text not found' })
  expect(await get('999999.1')).toEqual({ status: 404, message: 'Text not found' })
  expect(await get('1.1')).toEqual({ status: 200, nodes: true })
  expect(fetch).toHaveBeenCalledTimes(2)
})
