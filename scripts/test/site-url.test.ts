import { afterEach, describe, expect, it, vi } from 'vitest'
import { checkSiteUrl } from '../../templates/_features/site/site-url.ts'

// T12: only a Vercel build with the example address fails; CI and local builds of a fresh copy must still pass.
describe('checkSiteUrl', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it.each([
    ['Vercel, example address', 'throws', { VERCEL: '1' }, 'https://example.com'],
    ['CI, example address', 'warns', { VERCEL: '', CI: 'true' }, 'https://www.example.com'],
    ['local, example address', 'warns', { VERCEL: '', CI: '' }, 'https://example.com/'],
    ['Vercel, real address', 'silent', { VERCEL: '1' }, 'https://www.my-site.com'],
    ['Vercel, an address that only contains example.com', 'silent', { VERCEL: '1' }, 'https://example.com.my-site.at'],
  ])('%s → %s', (_, expected, env, url) => {
    for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value)
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    if (expected === 'throws') expect(() => checkSiteUrl(url)).toThrow('NUXT_PUBLIC_SITE_URL')
    else checkSiteUrl(url)
    expect(warn).toHaveBeenCalledTimes(expected === 'warns' ? 1 : 0)
  })
})
