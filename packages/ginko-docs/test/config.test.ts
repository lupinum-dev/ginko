import { defineSite } from '@lupinum/ginko'
import { expect, it } from 'vitest'
import { blogCollections, changelogCollection, changelogPages, docsCollection, docsHome, homePages } from '../src/config.ts'

// Wrong behaviour caught: the start page of another locale at `/de/`, an address ginko-i18n redirects, so `$page.home`,
// the sitemap and hreflang pointed at a redirect.
it('gives each locale its start page at its canonical address', () => {
  expect(homePages({ locales: ['en', 'de'] })).toEqual({ en: '/', de: '/de' })
  expect(changelogPages({ locales: ['de', 'en'] })).toEqual({ de: '/changelog', en: '/en/changelog' })
})

// Wrong behaviour caught: a docs site in the site file's form gets other page addresses than `docsCollection({ locales })`
// gave (`/de/docs/…` for a second language), or the blog loses the English labels docs sites store.
it('gives the docs and the blog their addresses per language from entries, with the English blog labels', () => {
  const site = defineSite({
    name: 'Docs', url: 'https://docs.example', timeZone: 'Europe/Vienna', currency: 'EUR', week: { firstDay: 'mo', workdays: ['mo', 'tu', 'we', 'th', 'fr'] }, locales: ['en', 'de'],
    entries: { docs: '/docs/[slug]', posts: '/blog/[slug]' },
    bricks: { home: docsHome(), docs: docsCollection(), ...blogCollections(), changelog: changelogCollection() },
  })
  expect([site.bricks.docs.route, site.bricks.posts.route]).toEqual([{ en: '/docs/[slug]', de: '/de/docs/[slug]' }, { en: '/blog/[slug]', de: '/de/blog/[slug]' }])
  expect([site.bricks.posts.label, site.bricks.authors.label, site.bricks.changelog.label]).toEqual(['Posts', 'Authors', 'Changelog'])
})

// Wrong behaviour caught: editors of a site without tabs see developer fields (Tab, Badge, a raw icon name).
it('leaves out Tab, Badge and Icon with navExtras: false, and keeps them by default', () => {
  const fields = (navExtras?: boolean) => Object.keys(docsCollection({ navExtras }).fields)
  expect(fields()).toEqual(expect.arrayContaining(['tab', 'badge', 'icon', 'navTitle', 'section', 'parent']))
  expect(fields(false).filter((k) => ['tab', 'badge', 'icon'].includes(k))).toEqual([])
})
