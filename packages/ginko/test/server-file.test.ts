// The site route that serves a platform file from the site's own address (runtime/server/file.ts); the platform is stubbed.
import { afterEach, expect, test, vi } from 'vitest'
import type { GinkoPublicConfig } from '../src/nuxt/runtime/shared.ts'

const config = { site: 'restaurant', platform: 'https://platform.test' } as GinkoPublicConfig

vi.mock('nuxt/server', () => ({
  defineEventHandler: <T>(handler: T) => handler,
  getRouterParam: (event: { params: Record<string, string> }, name: string) => event.params[name],
  createError: (input: { statusCode: number; statusMessage: string }) => Object.assign(new Error(input.statusMessage), input),
  useRuntimeConfig: () => ({ public: { ginko: config } }),
}))

const { default: handler } = await import('../src/nuxt/runtime/server/file.ts')
const id = 'k'.repeat(32)

/** The status and cache-control the route answers for a file address. */
async function get() {
  const event = { params: { upload: id, storage: id }, res: { headers: new Headers() } }
  const status = await (handler as unknown as (event: object) => Promise<unknown>)(event).then(() => 200, (error: { statusCode: number }) => error.statusCode)
  return [status, event.res.headers.get('cache-control')]
}

afterEach(() => vi.unstubAllGlobals())

// Wrong behaviour caught: a platform without the /file route redirects to its sign-in page, and the site caches that
// page for a year in place of the image.
test.each([
  ['an image', 'image/webp', 200, 'public, max-age=31536000, s-maxage=31536000, immutable'],
  ['an HTML page', 'text/html;charset=utf-8', 502, 'no-store'],
])('the platform answers %s', async (_name, type, status, cache) => {
  vi.stubGlobal('fetch', async () => new Response('bytes', { headers: { 'content-type': type } }))
  expect(await get()).toEqual([status, cache])
})
