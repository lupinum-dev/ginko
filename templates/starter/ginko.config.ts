// Starter template: a neutral site with free pages, notices, legal texts and contact details, in English and German.
// Every brick reads Markdown from content/, so the site runs without an account.
// To let editors change a brick in Ginko Studio later, name it in `studio.bricks` (README, "Move to the Studio").
import { defineSite, f, single } from '@lupinum/ginko'
import { legal, notices, site } from '@lupinum/ginko/patterns'
import { pages } from './app/bricks/pages.ts'
import { locales } from './app/routes.ts'
import { siteUrl } from './site-url.ts'

export default defineSite({
  name: 'Klara Brenner',
  // `color` fills the share cards: the light `--brand` of app/assets/css/main.css.
  seo: { description: 'A new website, built with Ginko.', color: '#18181b' },
  url: siteUrl('https://example.com'),
  timeZone: 'Europe/Berlin',
  locales,
  currency: 'EUR',
  // The site's id on a Ginko platform, and the bricks editors change in Ginko Studio: none yet, every brick is in files.
  studio: { id: 'starter', bricks: [] },
  // The fixed pages. A path is the same in every language; Ginko adds `/de` for German.
  pages: {
    home: '/',
  },
  // The page of one entry, by brick.
  entries: {
    pages: '/[slug]',
    legal: '/legal/[slug]',
  },
  bricks: {
    // The home page: title, lead and a short text (content/home.md).
    home: single({
      label: { de: 'Startseite', en: 'Home page', fr: 'Page d’accueil' },
      fields: {
        title: f.text({ de: 'Titel', en: 'Title', fr: 'Titre' }, { max: 80, default: 'Welcome' }),
        lead: f.longtext({ de: 'Einleitung', en: 'Lead', fr: 'Introduction' }, { max: 300, default: 'A short introduction: who you are and what you offer.' }),
        body: f.markdown({ de: 'Text', en: 'Text', fr: 'Texte' }, { profile: 'page', optional: true }),
      },
    }),
    // About, Contact and any other page: content/pages/.
    pages,
    // Short notices above the header, each until a date (content/notices/).
    notices: notices(),
    // Name, address and contact for the footer and search engines (content/site.md).
    site: site(),
    // Privacy policy, terms and imprint at /legal/<slug> (content/legal/).
    legal: legal(),
  },
})
