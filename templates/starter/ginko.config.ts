// Starter template: a neutral site with free pages, notices, legal texts and contact details, in English and German.
// Every brick reads Markdown from content/ (source: 'files'), so the site runs without an account.
// To let editors change a brick in Ginko Studio later, remove `source: 'files'` from it (README, "Move to the Studio").
import { defineSite, f, single } from '@lupinum/ginko'
import { legal, notices, site } from '@lupinum/ginko/basics'
import { pages } from './app/bricks/pages.ts'
import { locales, localized } from './app/routes.ts'
import { siteUrl } from './site-url.ts'

export default defineSite({
  site: 'starter',
  name: 'Klara Brenner',
  // `color` fills the share cards: the light `--brand` of app/assets/css/main.css.
  seo: { description: 'A new website, built with Ginko.', color: '#18181b' },
  url: siteUrl('https://example.com'),
  timeZone: 'Europe/Berlin',
  locales,
  currency: 'EUR',
  pages: {
    home: localized('/'),
  },
  bricks: {
    // The home page: title, lead and a short text (content/home.md).
    home: single({
      label: { de: 'Startseite', en: 'Home page', fr: 'Page d’accueil' },
      source: 'files',
      fields: {
        title: f.text({ de: 'Titel', en: 'Title', fr: 'Titre' }, { max: 80 }),
        lead: f.longtext({ de: 'Einleitung', en: 'Lead', fr: 'Introduction' }, { max: 300 }),
        body: f.markdown({ de: 'Text', en: 'Text', fr: 'Texte' }, { profile: 'page', optional: true }),
      },
    }),
    // About, Contact and any other page: content/pages/.
    pages: pages({ route: localized('/[slug]'), source: 'files' }),
    // Short notices above the header, each until a date (content/notices/).
    notices: notices({ source: 'files' }),
    // Name, address and contact for the footer and search engines (content/site.md).
    site: site({ source: 'files' }),
    // Privacy policy, terms and imprint at /legal/<slug> (content/legal/).
    legal: legal({ route: localized('/legal/[slug]'), source: 'files' }),
  },
})
