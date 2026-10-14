// A documentation site: the layout, side navigation and search come from @lupinum/ginko-docs.
// Every page is a Markdown file in content/docs/.
import { defineSite } from '@lupinum/ginko'
import { components, docsCollection } from '@lupinum/ginko-docs/config'

const locales = ['en'] as const

export default defineSite({
  site: '{{SITE}}',
  name: '{{SITE}}',
  url: 'https://example.com',
  timeZone: 'Europe/Vienna', // change for your country
  locales,
  currency: 'EUR', // change for your country
  pages: { home: '/' },
  // Shown in search results and link previews. Replace it with one sentence about your site.
  seo: { description: 'Documentation for our product.' },
  components, // the Markdown components (::callout, ::tabs …) and their checked props
  bricks: { docs: docsCollection({ locales }) },
})
