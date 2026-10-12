// A renamed page file must not silently break links and the sitemap (module.ts warns at build).
import { describe, expect, test } from 'vitest'
import type { Schema } from '../src/index.ts'
import { unservedPaths } from '../src/nuxt/pages.ts'

const schema = {
  pages: { home: { de: '/', en: '/en' }, menu: { de: '/speisekarte', en: '/en/menu' } },
  bricks: { events: { kind: 'collection', route: { de: '/veranstaltungen/[slug]', en: '/en/events/[slug]' } } },
} as unknown as Pick<Schema, 'pages' | 'bricks'>

describe('unservedPaths', () => {
  test('nothing to warn when every page and route has a Nuxt page', () => {
    const pages = [{ path: '/' }, { path: '/en' }, { path: '/speisekarte' }, { path: '/en/menu' }, { path: '/veranstaltungen/:slug()' }, { path: '/en/events/:slug()' }]
    expect(unservedPaths(schema, pages)).toEqual([])
  })

  test('a catch-all page serves everything', () => {
    expect(unservedPaths(schema, [{ path: '/:slug(.*)*' }])).toEqual([])
  })

  test('names the page and the route without a Nuxt page', () => {
    const pages = [{ path: '/' }, { path: '/en' }, { path: '/speisekarte' }, { path: '/veranstaltungen/:slug()' }]
    expect(unservedPaths(schema, pages)).toEqual([
      'pages.menu.en: no page at “/en/menu”. Fix: create the page or change the path in ginko.config.ts.',
      'events.route.en: no page at “/en/events/[slug]”. Fix: create the page (for example pages/…/[slug].vue) or change the route.',
    ])
  })
})
