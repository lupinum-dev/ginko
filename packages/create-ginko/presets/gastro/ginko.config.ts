// Opening hours and a menu from the gastro preset, both read from Markdown files in content/.
// The preset's other bricks (notices, lunch, events, gallery) and the owner's quick tasks need the Ginko platform.
import { defineSite } from '@lupinum/ginko'
import { hours, menu } from '@lupinum/ginko-preset-gastro'

export default defineSite({
  site: '{{SITE}}',
  name: '{{SITE}}',
  url: 'https://example.com',
  timezone: 'Europe/Vienna',
  locales: ['en'],
  currency: 'EUR',
  pages: { home: '/' },
  // Shown in search results and link previews. Replace it with one sentence about your site.
  seo: { description: 'Opening hours and menu of our restaurant.' },
  bricks: {
    // content/hours.md: weekly hours. The hours rules (hoursOn, todayState) count Austrian public holidays; calendar: 'DE', 'SG' or 'none' changes that.
    hours: hours({ source: 'files' }),
    // content/menu/: one file per dish. allergens: 'none' leaves out the allergen field.
    menu: menu({ allergens: 'none', source: 'files' }),
  },
})
