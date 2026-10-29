// The site's server proves itself to the platform with the private revalidate token (x-ginko-site-token),
// so visitors cannot use up the site's own bundle fetches (SPEC 6 rate limit).
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { fetchBundle, PlatformError, SITE_TOKEN_HEADER } from '../src/nuxt/runtime/fetch.ts'
import type { GinkoPublicConfig } from '../src/nuxt/runtime/shared.ts'

const bundle = readFileSync(fileURLToPath(new URL('../../../contracts/restaurant/bundle.format3.de.json', import.meta.url)), 'utf8')
const config = { site: 'restaurant', platform: 'https://platform.test' } as GinkoPublicConfig

function stubFetch() {
  const mock = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => new Response(bundle, { status: 200 }))
  vi.stubGlobal('fetch', mock)
  return () => (mock.mock.calls[0]![1] as RequestInit).headers as Record<string, string>
}

afterEach(() => vi.unstubAllGlobals())

describe('fetchBundle site token', () => {
  // Wrong behaviour caught: the site fetches as an anonymous visitor and is counted against the 600/min limit.
  test('sends x-ginko-site-token when the server has the token', async () => {
    const headers = stubFetch()
    await fetchBundle(config, 'de', undefined, 'secret-token-value')
    expect(headers()).toEqual({ accept: 'application/json', 'x-ginko-site-token': 'secret-token-value' })
    expect(SITE_TOKEN_HEADER).toBe('x-ginko-site-token')
  })

  test('sends no header without a token (browser, or a site without one)', async () => {
    const headers = stubFetch()
    await fetchBundle(config, 'de', undefined)
    expect(headers()).toEqual({ accept: 'application/json' })
    const empty = stubFetch()
    await fetchBundle(config, 'de', undefined, '')
    expect(empty()).toEqual({ accept: 'application/json' })
  })
})

describe('fetchBundle size', () => {
  // Wrong behaviour caught: a bundle the platform's budget allows (4 MiB of text plus up to 8 MiB of Markdown trees) is
  // refused as too large, so every page of the site answers 503. Spaces stand in for a large valid bundle.
  test('takes a 12 MiB bundle', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(bundle + ' '.repeat(12 * 1024 * 1024), { status: 200 })))
    await expect(fetchBundle(config, 'de', undefined)).resolves.toMatchObject({ site: 'restaurant' })
  })
})

describe('token stays private', () => {
  const src = (path: string) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8')

  // Wrong behaviour caught: the token lands in `runtimeConfig.public`, which Nuxt writes into every page's payload.
  test('the module declares it in private runtime config, never in public', () => {
    const module = src('../src/nuxt/module.ts')
    expect(module).toMatch(/nuxt\.options\.runtimeConfig\.ginkoRevalidateToken\s*\?\?=/)
    const publicBlock = module.slice(module.indexOf('runtimeConfig.public'), module.indexOf('// Languages come from'))
    expect(publicBlock).not.toMatch(/token|revalidate/i)
    expect(src('../src/nuxt/runtime/shared.ts')).not.toMatch(/token|revalidate/i)
  })

  test('the app plugin reads it on the server only', () => {
    expect(src('../src/nuxt/runtime/plugin.ts')).toMatch(/import\.meta\.server \? \(useRuntimeConfig\(\)\.ginkoRevalidateToken/)
  })
})

describe('fetchBundle when the platform is down', () => {
  const down = () => vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('fetch failed') }))

  // Wrong behaviour caught: a new dev site shows only "Content temporarily unavailable" and ECONNREFUSED, with no hint at `source: 'files'`.
  test('dev (local platform): names the bricks, the address and both fixes', async () => {
    down()
    const error = await fetchBundle({ ...config, platform: 'http://localhost:3100' } as GinkoPublicConfig, 'de', undefined).catch((e) => e)
    expect(error).toBeInstanceOf(PlatformError)
    expect(error.statusCode).toBe(503)
    expect(error.message).toContain('http://localhost:3100')
    expect(error.message).toContain('"contact"')
    expect(error.message).toContain("add source: 'files'")
    expect(error.message).toContain('NUXT_PUBLIC_GINKO_PLATFORM')
    expect(error.message).not.toContain('\n')
  })

  // Wrong behaviour caught: a deployment without the platform address answers 503 with no hint in the server log.
  test('production without NUXT_PUBLIC_GINKO_PLATFORM: plain 503, one log line naming the variable', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    for (let i = 0; i < 2; i++) {
      await expect(fetchBundle({ ...config, platform: '' }, 'de', undefined)).rejects.toMatchObject({ statusCode: 503, message: 'Content temporarily unavailable' })
    }
    expect(fetch).not.toHaveBeenCalled()
    expect(error.mock.calls).toEqual([[expect.stringContaining('platform address is not set')]])
    error.mockRestore()
  })

  // Wrong behaviour caught: production leaks dev advice, or stops being a plain 503.
  test('production keeps the plain 503 text', async () => {
    down()
    const error = await fetchBundle(config, 'de', undefined).catch((e) => e)
    expect(error).toMatchObject({ statusCode: 503, message: 'Content temporarily unavailable' })
  })
})
