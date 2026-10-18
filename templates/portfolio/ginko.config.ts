// Portfolio template: a small interior and object design studio in Hamburg with its projects (facts, photos with
// descriptions), the people of the studio, a journal and a page on how a project runs, in English (main) and German.
// Every brick reads Markdown from content/ (source: 'files'), so the site runs without an account. To let the studio
// change a brick in Ginko Studio later, remove `source: 'files'` from it (README, "Move to the Studio").
import { defineSite, f, single } from '@lupinum/ginko'
import { legal, notices, people, posts, site } from '@lupinum/ginko/basics'
import { pages } from './app/bricks/pages.ts'
import { projects } from './app/bricks/projects.ts'
import { locales, localized } from './app/routes.ts'
import { siteUrl } from './site-url.ts'

export default defineSite({
  site: 'portfolio',
  name: 'Studio Maren Holt',
  // `color` fills the share cards: the light `--brand` of app/assets/css/main.css.
  seo: {
    description: 'Studio Maren Holt designs interiors, furniture and objects in Hamburg: flats, shops and workplaces, and the things in them, made with workshops from the north of Germany.',
    color: '#1c1917',
  },
  url: siteUrl('https://example.com'),
  timeZone: 'Europe/Berlin',
  // German public holidays, and `addressCountry` in the studio's JSON-LD.
  country: 'DE',
  locales,
  languages: { en: 'en-GB', de: 'de-DE' },
  // Money fields would use it; this site shows no prices.
  currency: 'EUR',
  pages: {
    home: localized('/'),
    projects: localized('/projects'),
    team: localized('/team'),
    news: localized('/news'),
  },
  bricks: {
    // The first screen of the home page: what the studio does in one sentence and a lead (content/home.md).
    home: single({
      label: { de: 'Startseite', en: 'Home page' },
      source: 'files',
      fields: {
        title: f.text({ de: 'Titel', en: 'Title' }, { max: 100 }),
        lead: f.longtext({ de: 'Einleitung', en: 'Lead' }, { max: 300 }),
      },
    }),
    // Legal name, address, phone and email for the footer, the imprint, the "Start a project" email and the studio's
    // JSON-LD (content/site.md).
    site: site({ source: 'files' }),
    // Privacy policy and imprint: one file per text in content/legal/.
    legal: legal({ source: 'files', route: localized('/legal/[slug]') }),
    // Short lines at the top of every page ("The Holm chair can now be made to order"), each until a date
    // (content/notices/).
    notices: notices({ source: 'files' }),
    // The work, in the studio's order (content/projects/): client, year, place, scope, the text and the photos, each
    // with its description. The home page shows the first three. A project stays online until it is deleted; a new
    // one can wait as a draft (`draft: true` in its file), and Today lists the drafts.
    projects: projects({ source: 'files', route: localized('/projects/[slug]'), details: true }),
    // The journal, newest first (content/posts/). `authors` names entries of `people`. A file with `draft: true` never
    // goes online; in the Studio, Today shows how old the newest entry is, next to its write task (Today shows only
    // bricks with a task).
    posts: {
      ...posts({ source: 'files', authors: 'people', route: localized('/news/[slug]'), label: { de: 'Journal', en: 'Journal' } }),
      drafts: true,
      status: { age: 'date' },
      tasks: [{ id: 'write', kind: 'create', label: { de: 'Journalbeitrag schreiben', en: 'Write a journal entry' } }],
    },
    // The people of the studio (content/people/). No photos: the site shows initials.
    people: people({ source: 'files' }),
    // How a project runs, and any other page (content/pages/).
    pages: pages({ route: localized('/[slug]'), source: 'files' }),
  },
})
