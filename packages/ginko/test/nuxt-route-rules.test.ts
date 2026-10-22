import { expect, test } from 'vitest'
import { ginkoRouteRules, ginkoVercelConfig } from '../src/nuxt/route-rules.ts'

// Wrong behaviour caught: a site that sets its own cache time or turns ISR off gets Ginko's 60 s without a warning.
test('the site\'s own rules win; Ginko fills only what is unset', () => {
  expect(ginkoRouteRules({})['/**']).toEqual({ isr: { expiration: 60, allowQuery: [] } })
  expect(ginkoRouteRules({ '/**': { isr: 300, headers: { 'x-a': '1' } } })['/**']).toEqual({ isr: 300, headers: { 'x-a': '1' } })
  expect(ginkoRouteRules({ '/**': { isr: false } })['/**']).toEqual({ isr: false })
  expect(ginkoRouteRules({ '/api/**': { isr: 10 } })['/api/**']).toEqual({ isr: 10 })
})

// Wrong behaviour caught: build output under /__ginko/ gets the preview's no-store, so every search or page load
// runs the server function again; or it loses noindex and the JSON shows up in search results.
test('build output under /__ginko/ is cached until the next deploy; the rest is not cached; none is indexed', () => {
  const rules = ginkoRouteRules({})
  for (const path of ['/__ginko/files/**', '/__ginko/search/**']) {
    expect(rules[path]).toEqual({ isr: { expiration: false, allowQuery: [] }, headers: { 'cache-control': 'public, max-age=0, must-revalidate', 'x-robots-tag': 'noindex' } })
  }
  for (const path of ['/__ginko', '/__ginko/**']) {
    expect(rules[path]).toEqual({ isr: false, headers: { 'cache-control': 'no-store', 'x-robots-tag': 'noindex' } })
  }
  // The documented exception to "the site wins": a site's cache header cannot make the preview cacheable.
  expect(ginkoRouteRules({ '/__ginko/**': { isr: 60, headers: { 'cache-control': 'max-age=3600', 'x-a': '1' } } })['/__ginko/**'])
    .toEqual({ isr: false, headers: { 'cache-control': 'no-store', 'x-robots-tag': 'noindex', 'x-a': '1' } })
})

// Wrong behaviour caught: a page in seo.noindex answers without X-Robots-Tag and can still land in search; or Ginko's
// header replaces one the site set for that path itself.
test('the paths of seo.noindex answer with X-Robots-Tag: noindex; the site\'s own header wins', () => {
  const rules = ginkoRouteRules({ '/en/thanks': { headers: { 'x-robots-tag': 'noindex, nofollow' } } }, { noindex: ['/danke', '/en/thanks'] })
  expect(rules['/danke']).toEqual({ headers: { 'x-robots-tag': 'noindex' } })
  expect(rules['/en/thanks']).toEqual({ headers: { 'x-robots-tag': 'noindex, nofollow' } })
})

// Wrong behaviour caught: NUXT_GINKO_REVALIDATE_TOKEN silently replaces the bypass token the site set itself.
test('the site\'s own Vercel bypassToken wins; an unset one takes the env token', () => {
  expect(ginkoVercelConfig({ regions: ['fra1'], config: { bypassToken: 'site' } }, 'env')).toEqual({ regions: ['fra1'], config: { bypassToken: 'site' } })
  expect(ginkoVercelConfig(undefined, 'env')).toEqual({ config: { bypassToken: 'env' } })
})

// Wrong behaviour caught: on a site with platform bricks the search index stays cached until the next deploy, so a
// page published in the Studio is never found by the search box.
test('with platform bricks the search index expires like a page; the file bundles still wait for the next deploy', () => {
  expect(ginkoRouteRules({}, { platform: true })['/__ginko/search/**']?.isr).toEqual({ expiration: 60, allowQuery: [] })
  const rules = ginkoRouteRules({ '/**': { isr: 300 } }, { platform: true })
  expect(rules['/__ginko/search/**']?.isr).toBe(300)
  expect(rules['/__ginko/files/**']?.isr).toEqual({ expiration: false, allowQuery: [] })
})
