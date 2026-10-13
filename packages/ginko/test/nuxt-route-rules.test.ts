import { expect, test } from 'vitest'
import { ginkoRouteRules } from '../src/nuxt/route-rules.ts'

// Wrong behaviour caught: a site that sets its own cache time or turns ISR off gets Ginko's 60 s without a warning.
test('the site\'s own rules win; Ginko fills only what is unset', () => {
  expect(ginkoRouteRules({})['/**']).toEqual({ isr: { expiration: 60, allowQuery: [] } })
  expect(ginkoRouteRules({ '/**': { isr: 300, headers: { 'x-a': '1' } } })['/**']).toEqual({ isr: 300, headers: { 'x-a': '1' } })
  expect(ginkoRouteRules({ '/**': { isr: false } })['/**']).toEqual({ isr: false })
  expect(ginkoRouteRules({ '/api/**': { isr: 10 } })['/api/**']).toEqual({ isr: 10 })
})
