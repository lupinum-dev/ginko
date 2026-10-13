import { expect, test } from 'vitest'
import { ginkoRouteRules } from '../src/nuxt/route-rules.ts'

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
})
