// Nonprofit template: a river cleanup and community association in Germany with news, projects and campaigns,
// the board and team, reports to download and a few free pages, in English (main), German, French and Arabic (right to
// left). Every brick reads Markdown from content/, so the site runs without an account.
// To let the team change a brick in Ginko Studio later, name it in `studio.bricks` (README, "Move to the Studio").
import { defineSite, extend, f, single } from '@lupinum/ginko'
import { downloads, events, legal, notices, people, posts, site } from '@lupinum/ginko/patterns'
import { logos, quotes } from './app/bricks/logos-quotes.ts'
import { pages } from './app/bricks/pages.ts'
import { projects } from './app/bricks/projects.ts'
import { locales, localized } from './app/routes.ts'
import { siteUrl } from './site-url.ts'

export default defineSite({
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
  // The site's id on a Ginko platform, and the bricks the team edits in Ginko Studio: none yet, every brick is in files.
  studio: { id: 'nonprofit', bricks: [] },
  // The fixed pages. `localized` gives the path in each language with the words of app/routes.ts; Ginko adds the language.
  pages: {
    home: localized('/'),
    news: localized('/news'),
    events: localized('/events'),
    projects: localized('/projects'),
    team: localized('/team'),
    downloads: localized('/reports'),
  },
  // The page of one entry, by brick.
  entries: {
    legal: localized('/legal/[slug]'),
    posts: localized('/news/[slug]'),
    projects: localized('/projects/[slug]'),
    events: localized('/events/[slug]'),
    pages: localized('/[slug]'),
  },
  bricks: {
    // The home page's mission statement: title, lead and the photo next to it (content/home.md).
    home: single({
      label: { de: 'Startseite', en: 'Home page', fr: 'Page d’accueil' },
      fields: {
        title: f.text({ de: 'Titel', en: 'Title', fr: 'Titre' }, { max: 80, default: 'Welcome' }),
        lead: f.longtext({ de: 'Einleitung', en: 'Lead', fr: 'Introduction' }, { max: 300, default: 'A short introduction: who you are and what you offer.' }),
        image: f.image({ de: 'Bild', en: 'Image', fr: 'Image' }, { optional: true }),
      },
    }),
    // Name, address, register entry, phone and email for the footer, the imprint and the NGO JSON-LD (content/site.md).
    site: site(),
    // Privacy policy, terms of use and imprint: one file per text in content/legal/.
    legal: legal(),
    // Short lines at the top of every page ("The annual report is online"), each until a date (content/notices/).
    notices: notices(),
    // News, newest first (content/posts/). `authors` names entries of `people`. A file with `draft: true` never goes
    // online; in the Studio, volunteers' posts go live after a check, and Today shows how old the newest post is.
    posts: extend(posts({ authors: 'people' }), {
      status: { show: 'newest', field: 'date' },
      tasks: [{ id: 'write', kind: 'add', label: { en: 'Write a news post', de: 'Neuigkeit schreiben', fr: 'Écrire une actualité' }, needsApproval: true }],
    }),
    // What the association works on, and campaigns that end on a date (content/projects/).
    projects: projects(),
    // The board and the staff (content/people/). No photos: the site shows initials.
    people: people(),
    // Cleanups, meetings and other dates (content/events/), each on its own page. An event leaves the site after its
    // last day; the home page and Get involved show the next one, and so does Today.
    events: events(),
    // Reports and other PDFs, newest first (content/downloads/, the files in public/files/).
    downloads: extend(downloads(), { preview: 'downloads' }),
    // Partner logos on the home page (content/logos/, the files in public/logos/).
    logos,
    // Short quotes of members and partners on the home page (content/quotes/).
    quotes,
    // About, Get involved, Donate and any other page (content/pages/).
    pages,
  },
})
