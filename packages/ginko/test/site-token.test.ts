// The site's server proves itself to the platform with the private revalidate token (x-ginko-site-token),
// so visitors cannot use up the site's own bundle fetches (SPEC 6 rate limit).
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { fetchBundle, SITE_TOKEN_HEADER } from '../src/nuxt/runtime/fetch.ts'
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
