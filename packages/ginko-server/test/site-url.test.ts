// Which site addresses the platform may call with the refresh token (SSRF guard).
import { afterEach, describe, expect, it, vi } from 'vitest'
import { api } from '../convex/_generated/api'
import { isFetchableSiteUrl } from '../convex/lib/siteUrl'
import { errorOf, opId, setup } from './setup'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

// Wrong behaviour caught: an address that reaches the platform's own network, or one that is not https, gets the refresh token.
const PUBLIC = [
  'https://ginko-demo-restaurant.vercel.app',
  'https://example.com/path',
  'https://8.8.8.8',
  'https://[2606:4700:4700::1111]',
  'https://100.63.255.255', // just below CGNAT
  'https://172.32.0.1', // just above 172.16/12
  'https://[2001:db8::1]',
]
const BLOCKED = [
  'http://example.com', // not https
  'ftp://example.com',
  'javascript:alert(1)',
  'not a url',
  'https://user:pass@example.com',
  'https://localhost', 'https://localhost.', 'https://app.localhost', 'https://LOCALHOST:8080',
  'https://db.internal', 'https://printer.local', 'https://metadata.google.internal',
  'https://127.0.0.1', 'https://127.1', 'https://2130706433', 'https://0x7f.0.0.1', 'https://0.0.0.0',
  'https://10.0.0.5', 'https://172.16.0.1', 'https://172.31.255.255', 'https://192.168.1.1',
  'https://169.254.169.254', // cloud metadata
  'https://100.64.0.1', 'https://100.127.255.255', // CGNAT
  'https://192.0.0.1', 'https://198.18.0.1', 'https://224.0.0.1', 'https://255.255.255.255',
  'https://[::1]', 'https://[::]', 'https://[fe80::1]', 'https://[febf::1]',
  'https://[fc00::1]', 'https://[fd12:3456::1]', 'https://[ff02::1]',
  'https://[::ffff:127.0.0.1]', 'https://[::ffff:10.1.2.3]', 'https://[64:ff9b::a00:1]', 'https://[2002:7f00:1::]',
]

describe('isFetchableSiteUrl', () => {
  it.each(PUBLIC)('allows %s', (url) => expect(isFetchableSiteUrl(url)).toBe(true))
  it.each(BLOCKED)('refuses %s', (url) => expect(isFetchableSiteUrl(url)).toBe(false))

  it('local deployments also take loopback hosts over http, and nothing else new', () => {
    for (const url of ['http://localhost:3000', 'http://127.0.0.1:3000', 'http://[::1]:3000', 'http://app.localhost', 'https://localhost']) expect(isFetchableSiteUrl(url, true)).toBe(true)
    for (const url of ['http://example.com', 'http://10.0.0.5', 'https://169.254.169.254', 'https://db.internal', 'http://localhost.evil.com']) expect(isFetchableSiteUrl(url, true)).toBe(false)
  })
})

describe('site URL in the platform', () => {
  it('urgentRefresh sends the token nowhere when the stored URL is not allowed', async () => {
    const { t, as, site } = await setup()
    await t.run((ctx) => ctx.db.patch(site, { refreshToken: 'token-test', url: 'https://169.254.169.254' }))
    const fetched = vi.fn()
    vi.stubGlobal('fetch', fetched)
    expect(await errorOf(as.owner.action(api.refresh.urgentRefresh, { site: 'restaurant', opId: opId() }))).toMatchObject({ code: 'INVALID', key: 'errors.siteUrlNotAllowed' })
    expect(fetched).not.toHaveBeenCalled()
  })

  it('an admin cannot create a site with an internal address, and a local deployment may use localhost', async () => {
    const s = await setup()
    const create = (slug: string, url: string) => s.as.admin.mutation(api.sites.create, { slug, name: 'Neu', url })
    expect(await errorOf(create('intern', 'https://10.0.0.5'))).toMatchObject({ code: 'INVALID', key: 'errors.siteUrlNotAllowed' })
    expect(await errorOf(create('lokal', 'http://localhost:3000'))).toMatchObject({ code: 'INVALID', key: 'errors.siteUrlNotAllowed' })
    vi.stubEnv('GINKO_LOCAL', '1')
    expect(await create('lokal', 'http://localhost:3000')).toEqual({ slug: 'lokal' })
  })
})
