// POC T2: the company template written in v2, beside ginko.config.ts. Both must produce the same stored model
// (packages/ginko/test/v2/on-v1.test.ts).
//
// The site file says which bricks exist, where their pages are and who edits them. The site's own bricks are plain
// objects in app/bricks/v2.ts. The ready-made bricks still come from the v1 functions, called without `source` and
// `route`; making them plain objects that bring their Today line is POC T3.
import { defineSite } from '@lupinum/ginko/v2'
import { downloads, events, jobs, legal, notices, people, posts, site } from '@lupinum/ginko/basics'
import { home, logos, pages, quotes, serviceLine, services } from './app/bricks/v2.ts'
import de from './i18n/studio/de.json' with { type: 'json' }
import fr from './i18n/studio/fr.json' with { type: 'json' }
import { siteUrl } from './site-url.ts'

export default defineSite({
  name: 'Halden Pumps',
  url: siteUrl('https://example.com'),
  timeZone: 'Europe/Berlin',
  locales: ['en', 'de'],
  languages: { en: 'en-GB', de: 'de-DE' },
  currency: 'EUR',
  country: 'DE',
  seo: {
    description: 'Halden Pumps builds centrifugal and submersible pumps and complete pumping stations for water, wastewater and industry, and services them across Germany.',
    color: '#0369a1',
  },

  bricks: {
    home,
    serviceLine,
    site: site(),
    legal: legal(),
    notices: notices(),
    services,
    jobs: { ...jobs(), status: { count: true } },
    posts: {
      ...posts({ authors: 'people' }),
      status: { age: 'date' },
      tasks: [{ id: 'write', kind: 'create', label: { en: 'Write a news post', de: 'Neuigkeit schreiben' } }],
    },
    people: people(),
    events: { ...events({}), status: { next: 'when' } },
    downloads: downloads(),
    logos,
    quotes,
    pages,
  },

  pages: {
    home: '/',
    services: { en: '/products', de: '/produkte' },
    jobs: { en: '/jobs', de: '/karriere' },
    news: { en: '/news', de: '/aktuelles' },
    events: { en: '/trade-fairs', de: '/messen' },
    team: { en: '/contact', de: '/kontakt' },
    downloads: '/downloads',
  },
  entries: {
    services: { en: '/products/[slug]', de: '/produkte/[slug]' },
    jobs: { en: '/jobs/[slug]', de: '/karriere/[slug]' },
    posts: { en: '/news/[slug]', de: '/aktuelles/[slug]' },
    events: { en: '/trade-fairs/[slug]', de: '/messen/[slug]' },
    legal: { en: '/legal/[slug]', de: '/rechtliches/[slug]' },
    pages: '/[slug]',
  },

  // A files site that is also shown as a hosted demo keeps its id; no brick is edited in the Studio.
  studio: { id: 'company', bricks: [] },
  texts: { de, fr },
})
