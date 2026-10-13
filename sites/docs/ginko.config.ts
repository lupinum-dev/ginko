// The Ginko docs. Every page comes from Markdown in content/docs (CONTENT.md); the layout,
// search and components come from @lupinum/ginko-docs. This site never asks the platform.
import { defineSite } from '@lupinum/ginko'
import { blogCollections, blogPages, changelogCollection, changelogPages, docsCollection, docsHome } from '@lupinum/ginko-docs/config'
import { components } from '@lupinum/ginko-components/registry'

const locales = ['de', 'en'] as const

export default defineSite({
  site: 'ginko-docs',
  name: 'Ginko',
  url: 'https://ginko-docs.vercel.app',
  timezone: 'Europe/Vienna',
  locales,
  currency: 'EUR',
  pages: { home: { de: '/', en: '/en' }, blog: blogPages({ locales }), changelog: changelogPages({ locales }) },
  components,
  bricks: { home: docsHome(), docs: docsCollection({ locales }), ...blogCollections({ locales }), changelog: changelogCollection() },
})
