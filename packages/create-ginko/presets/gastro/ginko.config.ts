// Opening hours and a menu from the gastro preset, both read from Markdown files in content/.
// The preset's other bricks (notices, lunch, events, gallery) and the owner's quick tasks need the Ginko platform.
import { defineSite } from '@lupinum/ginko'
import { hours, menu } from '@lupinum/ginko-preset-gastro'

export default defineSite({
  site: '{{SITE}}',
  name: '{{SITE}}',
  url: 'https://example.com',
  timeZone: 'Europe/Vienna', // change for your country
  locales: ['en'],
  currency: 'EUR', // change for your country
  pages: { home: '/' },
  // Shown in search results and link previews. Replace it with one sentence about your site.
  // `color`: the brand colour of the generated share cards.
  seo: { description: 'Opening hours and menu of our restaurant.', color: '#1e4032' },
  bricks: {
    // content/hours.md: weekly hours. The hours rules (hoursOn, todayState) count Austrian public holidays; pass them calendar: 'DE', 'SG' or 'none' to change that.
    hours: hours({ source: 'files' }),
    // content/menu/: one file per dish. allergens: 'none' leaves out the allergen field.
    menu: menu({ allergens: 'none', source: 'files' }),
  },
})
