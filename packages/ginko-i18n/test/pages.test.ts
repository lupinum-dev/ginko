import { describe, expect, it } from 'vitest'
import { resolveConfig } from '../src/core/locales'
import { localizePages } from '../src/pages'

describe('localizePages', () => {
  const config = resolveConfig({ locales: ['en', 'de'] })
  // Wrong behaviour caught: the empty page Nuxt adds at a redirect's source got a copy per locale, so /de/docs/old
  // answered 200 with an empty page instead of 404 (only /docs/old has a redirect rule).
  it('keeps the page of a redirect rule at its one address', () => {
    const stub = { path: '/docs/old', file: '/app/node_modules/nuxt/dist/pages/runtime/component-stub.js', _sync: true }
    const page = { name: 'docs', path: '/docs', file: '/app/pages/docs.vue' }
    expect(localizePages([stub, page], config).map(p => p.path)).toEqual(['/docs/old', '/docs', '/de/docs'])
  })
})
