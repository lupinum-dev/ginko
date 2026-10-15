import { describe, expect, it, vi } from 'vitest'

// The module file imports the Nuxt kit only to register itself; the address logic is a pure function.
vi.mock('nuxt/kit', () => ({ defineNuxtModule: (module: unknown) => module, tryImportModule: () => undefined }))
const { pagePaths } = await import('../../templates/_features/site/modules/page-paths.ts')

const site = {
  locales: ['en', 'de', 'it'],
  pages: { menu: { en: '/menu', de: '/de/speisekarte', it: '/it/menu' }, home: { en: '/', de: '/de', it: '/it' } },
  bricks: { legal: { route: { en: '/legal/[slug]', de: '/de/rechtliches/[slug]', it: '/it/legale/[slug]' } } },
}
const segments = { print: { en: 'print', de: 'drucken', it: 'stampa' } }

describe('pagePaths', () => {
  // Wrong behaviour caught: a nested page without a `pages` key answers at the parent's word plus the English child
  // (/de/speisekarte/print), and a `pages` key to fix it would put the print page into the sitemap.
  it.each([
    ['a nested page with a word of its own per language', '/menu/print', { en: '/menu/print', de: '/speisekarte/drucken', it: '/menu/stampa' }],
    ['a page of a brick route', '/legal/[slug]', { en: '/legal/[slug]', de: '/rechtliches/[slug]', it: '/legale/[slug]' }],
    ['a page that is a key of `pages`', '/menu', { en: '/menu', de: '/speisekarte', it: '/menu' }],
    ['a nested page with no word in `segments`', '/menu/extra', { en: '/menu/extra', de: '/speisekarte/extra', it: '/menu/extra' }],
  ])('%s', (_name, file, expected) => {
    expect(pagePaths(site, segments, file)).toEqual(expected)
  })

  it('leaves a page with no configured address alone', () => {
    expect(pagePaths(site, segments, '/about')).toBeUndefined()
  })
})
