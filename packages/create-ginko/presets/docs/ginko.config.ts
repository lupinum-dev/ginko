// A documentation site: the layout, side navigation and search come from @lupinum/ginko-docs.
// Every page is a Markdown file in content/docs/.
import { defineSite } from '@lupinum/ginko'
import { docsCollection } from '@lupinum/ginko-docs/config'
import { components } from '@lupinum/ginko-components/registry'

const locales = ['en'] as const

export default defineSite({
  site: '{{SITE}}',
  name: '{{SITE}}',
  url: 'https://example.com',
  timezone: 'Europe/Vienna',
  locales,
  currency: 'EUR',
  pages: { home: '/' },
  components, // the Markdown components (::callout, ::tabs …) and their checked props
  bricks: { docs: docsCollection({ locales }) },
})
