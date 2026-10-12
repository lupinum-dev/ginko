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
  bricks: {
    // content/hours.md: weekly hours. content/menu/: one file per dish; allergens: "none" leaves out the allergen field.
    hours: { ...hours({ lang: 'en' }), source: 'files' },
    menu: { ...menu({ lang: 'en', allergens: 'none' }), source: 'files' },
  },
})
