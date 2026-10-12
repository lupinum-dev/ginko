// A static host serves only what `nuxt generate` wrote: a missing route is a 404 in production.
import { describe, expect, test } from 'vitest'
import type { Bundle, Schema } from '../src/index.ts'
import { markdownTwin, prerenderRoutes } from '../src/nuxt/prerender.ts'

const schema = { locales: ['de', 'en'], pages: { home: { de: '/', en: '/en' }, search: { de: '/suche', en: '/en/search' } } } as unknown as Pick<Schema, 'pages' | 'locales'>
const bundle = (locale: string, urls: (string | undefined)[]) => ({
  locale,
  bricks: {
    docs: { kind: 'collection', items: urls.map((url, i) => ({ id: `e${i}`, data: {}, fallback: [], urls: url ? { [locale]: url } : undefined })) },
    footer: { kind: 'single', data: {}, fallback: [] },
  },
}) as unknown as Bundle
const bundles = { de: bundle('de', ['/docs/einstieg', undefined]), en: bundle('en', ['/en/docs/getting-started']) }
const trees = ['/__ginko/files/de/md/docs/e0/body.json']

describe('prerenderRoutes', () => {
  test('lists pages, entries, .md twins, documents, JSON routes and trees', () => {
    expect(prerenderRoutes(schema, bundles, trees, { robots: true, llms: true, llmsFull: true, markdown: true }).sort()).toEqual([
      '/',
      '/__ginko/files/de.json',
      '/__ginko/files/de/md/docs/e0/body.json',
      '/__ginko/files/en.json',
      '/__ginko/search/de.json',
      '/__ginko/search/en.json',
      '/docs/einstieg',
      '/docs/einstieg.md',
      '/en',
      '/en/docs/getting-started',
      '/en/docs/getting-started.md',
      '/en/search',
      '/llms-full.txt',
      '/llms.txt',
      '/robots.txt',
      '/sitemap.xml',
      '/suche',
    ])
  })

  test('leaves out what the site serves itself or turns off', () => {
    const routes = prerenderRoutes(schema, bundles, [], { robots: false, llms: false, llmsFull: false, markdown: false })
    expect(routes).not.toContain('/robots.txt')
    expect(routes).not.toContain('/llms.txt')
    expect(routes).not.toContain('/llms-full.txt')
    expect(routes).not.toContain('/docs/einstieg.md')
    expect(routes).toContain('/docs/einstieg')
  })
})

test.each([['/', '/index.md'], ['/docs/a', '/docs/a.md'], ['/docs/a/', '/docs/a.md']])('markdownTwin(%s)', (path, twin) => {
  expect(markdownTwin(path)).toBe(twin)
})
