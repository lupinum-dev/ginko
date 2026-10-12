// A documentation site: the layout, side navigation and search come from @lupinum/ginko-docs.
// Every page is a Markdown file in content/docs/.
import { defineSite } from '@lupinum/ginko'
import { docsCollection } from '@lupinum/ginko-docs/config'

const locales = ['en'] as const

export default defineSite({
  site: '{{SITE}}',
  name: '{{SITE}}',
  url: 'https://example.com',
  timezone: 'Europe/Vienna',
  locales,
  currency: 'EUR',
  pages: { home: '/' },
  bricks: { docs: docsCollection(locales) },
})
