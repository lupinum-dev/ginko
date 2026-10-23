// The blog and changelog bricks come from @lupinum/ginko/basics. A docs site stores their schema on the platform, so a
// change in basics (a label, a field, an option, the key order) must not reach it unnoticed: the three bricks of the
// docs site serialize to the bytes they had before basics existed (0.4.0), plus the one reviewed change: `drafts: true`
// on the changelog (an allowed release diff).
import { createHash } from 'node:crypto'
import { expect, it } from 'vitest'
import { serializeSchema } from '@lupinum/ginko/internal'
import docsSite from '../../../sites/docs/ginko.config.ts'
import { blogCollections, changelogCollection, changelogPages, docsCollection, docsHome, homePages, type DocsSource } from '../src/config.ts'

it('keeps the stored schema of the blog and changelog bricks byte for byte', () => {
  const { bricks } = serializeSchema(docsSite)
  const json = JSON.stringify([bricks.posts, bricks.authors, bricks.changelog])
  expect(createHash('sha256').update(json).digest('hex')).toBe('c63de4848d8b29d3c3ed9cc64ef9bce93fdf0b31c3dd77ee1e2b9c8e109ab3e3')
})

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
