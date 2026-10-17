// Docs template: the documentation of "Orbit SDK", a fictional TypeScript client for the fictional Orbit API, in
// English and German. Every brick reads Markdown from content/ (source: 'files'), so the site runs without an account.
// To let editors change a brick in Ginko Studio later, remove `source: 'files'` from it (README, "Move to the Studio").
import { defineSite } from '@lupinum/ginko'
import { changelogCollection, changelogPages, components, docsCollection, docsHome } from '@lupinum/ginko-docs/config'
import { siteUrl } from './site-url.ts'

// The first language is the main one: its pages have no prefix (/docs/…), the others do (/de/docs/…).
const locales = ['en', 'de'] as const

export default defineSite({
  site: 'docs',
  name: 'Orbit SDK',
  // `color` fills the share cards: the light --primary of app/assets/css/main.css.
  seo: { description: 'Documentation of Orbit SDK, the TypeScript client for the Orbit API.', color: '#047857' },
  url: siteUrl('https://example.com'),
  timeZone: 'Europe/Berlin',
  locales,
  currency: 'EUR',
  pages: {
    home: { en: '/', de: '/de' },
    changelog: changelogPages({ locales }),
  },
  // The Markdown components of the pages (::callout, ::tabs, ::steps …); Ginko checks every tag and prop against them.
  components,
  bricks: {
    // The start page: title, install command, two buttons, the cards and a short text (content/home.md).
    home: docsHome(),
    // The pages, in the order of their file numbers; `section` in a page starts a group (content/docs/).
    docs: docsCollection({ locales }),
    // One entry per release with version and date, newest first on /changelog (content/changelog/).
    changelog: changelogCollection(),
  },
})
