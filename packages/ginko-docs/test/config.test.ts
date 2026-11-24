import { expect, it } from 'vitest'
import { blogCollections, changelogCollection, changelogPages, docsCollection, docsHome, homePages, type DocsSource } from '../src/config.ts'

// Wrong behaviour caught: the start page of another locale at `/de/`, an address ginko-i18n redirects, so `$page.home`,
// the sitemap and hreflang pointed at a redirect.
it('gives each locale its start page at its canonical address', () => {
  expect(homePages({ locales: ['en', 'de'] })).toEqual({ en: '/', de: '/de' })
  expect(changelogPages({ locales: ['de', 'en'] })).toEqual({ de: '/changelog', en: '/en/changelog' })
})

// Wrong behaviour caught: a factory that ignores `source: 'platform'`, so a docs site moved to Ginko Studio still reads
// its pages from files and the Studio has nothing to edit; or a default that no longer reads files.
it.each([
  ['docsCollection', (source?: DocsSource) => [docsCollection({ locales: ['en'], source })]],
  ['docsHome', (source?: DocsSource) => [docsHome({ source })]],
  ['blogCollections', (source?: DocsSource) => Object.values(blogCollections({ locales: ['en'], source }))],
  ['changelogCollection', (source?: DocsSource) => [changelogCollection({ source })]],
] as const)('%s reads files by default and the platform with source: platform', (_, bricks) => {
  expect(bricks().map((brick) => brick.source)).toEqual(bricks().map(() => 'files'))
  expect(bricks('platform').map((brick) => 'source' in brick)).toEqual(bricks().map(() => false))
})

// Wrong behaviour caught: editors of a site without tabs see developer fields (Tab, Badge, a raw icon name).
it('leaves out Tab, Badge and Icon with navExtras: false, and keeps them by default', () => {
  const fields = (navExtras?: boolean) => Object.keys(docsCollection({ locales: ['de'], navExtras }).fields)
  expect(fields()).toEqual(expect.arrayContaining(['tab', 'badge', 'icon', 'navTitle', 'section', 'parent']))
  expect(fields(false).filter((k) => ['tab', 'badge', 'icon'].includes(k))).toEqual([])
})
