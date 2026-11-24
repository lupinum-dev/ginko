// POC T2: the starter template written in v2, beside ginko.config.ts. Both must produce the same stored model
// (packages/ginko/test/v2/on-v1.test.ts). The ready-made bricks still come from the v1 functions (POC T3).
import { defineSite } from '@lupinum/ginko/v2'
import { legal, notices, site } from '@lupinum/ginko/basics'
import { home, pages } from './app/bricks/v2.ts'
import de from './i18n/studio/de.json' with { type: 'json' }
import fr from './i18n/studio/fr.json' with { type: 'json' }
import { siteUrl } from './site-url.ts'

export default defineSite({
  name: 'Klara Brenner',
  url: siteUrl('https://example.com'),
  timeZone: 'Europe/Berlin',
  locales: ['en', 'de'],
  currency: 'EUR',
  seo: { description: 'A new website, built with Ginko.', color: '#18181b' },

  bricks: { home, pages, notices: notices(), site: site(), legal: legal() },

  pages: { home: '/' },
  entries: {
    pages: '/[slug]',
    legal: '/legal/[slug]',
  },

  // A files site that is also shown as a hosted demo keeps its id; no brick is edited in the Studio.
  studio: { id: 'starter', bricks: [] },
  texts: { de, fr },
})
