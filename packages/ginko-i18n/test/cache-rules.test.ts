import { describe, expect, it } from 'vitest'
import { cachedNegotiatedPaths } from '../src/cache-rules'

// D10: a cached response whose language came from a cookie or header serves one visitor's language to all.
describe('cachedNegotiatedPaths', () => {
  const negotiated = ['/api/**', '/app/**']
  it.each([
    ['a broad rule over everything', { '/**': { isr: 60 } }, [{ pattern: '/**', path: '/api/**' }]],
    ['a narrower rule inside /api', { '/api/products/**': { swr: 60 } }, [{ pattern: '/api/products/**', path: '/api/**' }]],
    ['a rule inside a user-locale zone', { '/app/dashboard': { cache: { maxAge: 60 } } }, [{ pattern: '/app/dashboard', path: '/app/**' }]],
    ['a more specific rule that turns caching off', { '/**': { isr: 60 }, '/api/**': { isr: false }, '/app/**': { isr: false } }, []],
    ['caching outside negotiated paths', { '/blog/**': { isr: 60 } }, []],
  ])('%s', (_, rules, expected) => {
    expect(cachedNegotiatedPaths(rules, negotiated)).toEqual(expected)
  })
})
