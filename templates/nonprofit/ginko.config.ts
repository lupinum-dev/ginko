// Nonprofit template: a river clean-up and community association in Germany with news, projects and campaigns,
// the board and team, reports to download and a few free pages, in English (main), German, French and Arabic (right to
// left). Every brick reads Markdown from content/ (source: 'files'), so the site runs without an account.
// To let the team change a brick in Ginko Studio later, remove `source: 'files'` from it (README, "Move to the Studio").
import { defineSite, f, single } from '@lupinum/ginko'
import { downloads, events, legal, notices, people, posts, site } from '@lupinum/ginko/basics'
import { logos, quotes } from './app/bricks/logos-quotes.ts'
import { pages } from './app/bricks/pages.ts'
import { projects } from './app/bricks/projects.ts'
import { locales, localized } from './app/routes.ts'
import { siteUrl } from './site-url.ts'

export default defineSite({
  site: 'nonprofit',
  name: 'River Commons',
  // `color` fills the share cards: the light `--brand` of app/assets/css/main.css.
  seo: {
    description: 'River Commons is an association of neighbours who keep the river clean, test its water and plant its banks.',
    color: '#15803d',
  },
  url: siteUrl('https://example.com'),
  timeZone: 'Europe/Berlin',
  // German public holidays, and `addressCountry` in the NGO JSON-LD.
  country: 'DE',
  locales,
  languages: { en: 'en-GB', de: 'de-DE', fr: 'fr-FR', ar: 'ar' },
  currency: 'EUR',
  pages: {
    home: localized('/'),
    news: localized('/news'),
    projects: localized('/projects'),
    team: localized('/team'),
    downloads: localized('/reports'),
  },
  bricks: {
    // The home page's mission statement: title, lead and the photo next to it (content/home.md).
    home: single({
      label: { de: 'Startseite', en: 'Home page', fr: 'Page d’accueil' },
      source: 'files',
      fields: {
        title: f.text({ de: 'Titel', en: 'Title', fr: 'Titre' }, { max: 80 }),
        lead: f.longtext({ de: 'Einleitung', en: 'Lead', fr: 'Introduction' }, { max: 300 }),
        image: f.image({ de: 'Bild', en: 'Image', fr: 'Image' }, { optional: true }),
      },
    }),
    // Name, address, register entry, phone and email for the footer, the imprint and the NGO JSON-LD (content/site.md).
    site: site({ source: 'files' }),
    // Privacy policy, terms of use and imprint: one file per text in content/legal/.
    legal: legal({ source: 'files', route: localized('/legal/[slug]') }),
    // Short lines at the top of every page ("The annual report is online"), each until a date (content/notices/).
    notices: notices({ source: 'files' }),
    // News, newest first (content/posts/). `authors` names entries of `people`. A file with `draft: true` never goes
    // online; in the Studio, volunteers' posts go live after a check, and Today shows how old the newest post is.
    posts: {
      ...posts({ source: 'files', authors: 'people', route: localized('/news/[slug]') }),
      drafts: true,
      status: { age: 'date' },
      tasks: [{ id: 'write', kind: 'create', label: { en: 'Write a news post', de: 'Neuigkeit schreiben', fr: 'Écrire une actualité' }, needsApproval: true }],
    },
    // What the association works on, and campaigns that end on a date (content/projects/).
    projects: projects({ source: 'files', route: localized('/projects/[slug]') }),
    // The board and the staff (content/people/). No photos: the site shows initials.
    people: people({ source: 'files' }),
    // Clean-ups, meetings and other dates (content/events/). An event leaves the site after its last day; the home
    // page and Get involved show the next one, and so does Today. No `route` yet: the events pages come with a later
    // version of this template, so no link and no sitemap entry leads nowhere.
    events: { ...events({ source: 'files' }), status: { next: 'when' } },
    // Reports and other PDFs, newest first (content/downloads/, the files in public/reports/).
    downloads: downloads({ source: 'files' }),
    // Partner logos on the home page (content/logos/, the files in public/logos/).
    logos: logos({ source: 'files' }),
    // Short quotes of members and partners on the home page (content/quotes/).
    quotes: quotes({ source: 'files' }),
    // About, Get involved, Donate and any other page (content/pages/).
    pages: pages({ route: localized('/[slug]'), source: 'files' }),
  },
})
