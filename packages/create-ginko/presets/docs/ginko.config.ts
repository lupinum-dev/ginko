// A documentation site: the layout, side navigation and search come from @lupinum/ginko-docs.
// Every page is a Markdown file in content/docs/.
import { defineSite } from '@lupinum/ginko'
import { components, docsCollection } from '@lupinum/ginko-docs/config'

const locales = ['en'] as const

export default defineSite({
  studio: { id: '{{SITE}}', bricks: [] }, // the site's id on a Ginko platform; every page is a file in content/
  name: '{{SITE}}',
  url: 'https://example.com',
  timeZone: 'Europe/Vienna', // change for your country
  // The site's week: the calendar starts on firstDay, and workdays are the days you work.
  week: { firstDay: 'mo', workdays: ['mo', 'tu', 'we', 'th', 'fr'] },
  locales,
  currency: 'EUR', // change for your country
  pages: { home: '/' },
  entries: { docs: '/docs/[slug]' }, // the address of each page
  // Shown in search results and link previews. Replace it with one sentence about your site.
  // `color`: the brand colour of the generated share cards.
  seo: { description: 'Documentation for our product.', color: '#047857' },
  components, // the Markdown components (::callout, ::tabs …) and their checked props
  bricks: { docs: docsCollection() },
})
