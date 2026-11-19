// The image addresses a production build prerenders (platform-files.ts).
import { afterEach, describe, expect, test, vi } from 'vitest'
import { fileAddresses, platformFileRoutes } from '../src/nuxt/platform-files.ts'

const upload = 'kx7aaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
const original = 'kg2aaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
const small = 'kg2bbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
const address = (storage: string) => `/__ginko/file/${upload}/${storage}`

const image = { url: address(original), width: 1600, variants: [{ url: address(small), width: 480 }] }
const bundleOf = (locale: string, data: Record<string, unknown>) => ({ site: 'demo', locale, bricks: { home: { kind: 'single', data } } })

describe('fileAddresses', () => {
  // Wrong behaviour caught: the srcset copies are left out, so the browser's pick still waits for the function.
  test('every variant and every locale, each address once', () => {
    expect(fileAddresses([bundleOf('en', { image }), bundleOf('de', { image })])).toEqual([address(original), address(small)])
  })

  // Wrong behaviour caught: a text that mentions an address, or a path of another shape, is prerendered (and fails).
  test('only whole addresses of the stored shape count', () => {
    const text = `See ${address(original)} for the photo.`
    const others = ['/__ginko/file/short/id', `${address(original)}/more`, `/__ginko/files/${upload}/${original}`]
    expect(fileAddresses([bundleOf('en', { body: text, links: others })])).toEqual([])
    expect(fileAddresses([bundleOf('en', { title: 'No images' })])).toEqual([])
  })
})

describe('platformFileRoutes', () => {
  afterEach(() => vi.unstubAllGlobals())

  // Wrong behaviour caught: the build fetches as an anonymous visitor and is counted against the visitor rate limit.
  test('reads each locale with the site token', async () => {
    const fetch = vi.fn(async (_url: string, _init?: RequestInit) => Response.json(bundleOf('en', { image })))
    vi.stubGlobal('fetch', fetch)
    const result = await platformFileRoutes({ platform: 'https://platform.test/', site: 'demo', locales: ['en', 'de'], siteToken: 'token-value' })
    expect(result).toEqual({ routes: [address(original), address(small)] })
    expect(fetch.mock.calls.map(([url]) => url)).toEqual([
      'https://platform.test/bundle/demo?format=3&locale=en&files=stable',
      'https://platform.test/bundle/demo?format=3&locale=de&files=stable',
    ])
    expect(fetch.mock.calls[0]![1]!.headers).toEqual({ accept: 'application/json', 'x-ginko-site-token': 'token-value' })
  })

  // Wrong behaviour caught: a platform that is down or not set fails the deploy instead of leaving images to the function.
  test('no platform address or no answer: no routes and one warning, never an error', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 503 })))
    const down = await platformFileRoutes({ platform: 'https://platform.test', site: 'demo', locales: ['en', 'de'] })
    expect(down).toEqual({ routes: [], warning: '[ginko] Images are not part of the build: the platform did not answer the bundle request (HTTP 503). Images are served through the function as before.' })
    const unset = await platformFileRoutes({ platform: undefined, site: 'demo', locales: ['en'] })
    expect(unset).toEqual({ routes: [], warning: '[ginko] Images are not part of the build: the platform address is not set. Images are served through the function as before.' })
  })
})
