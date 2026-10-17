// Company template: a mid-sized German maker of industrial pumps and pumping stations with its products and services,
// open jobs, news, sales and service contacts, customers and references, product sheets to download and the trade
// fairs where it shows, in English (main) and German. Every brick reads Markdown from content/ (source: 'files'), so
// the site runs without an account. To let the team change a brick in Ginko Studio later, remove `source: 'files'`
// from it (README, "Move to the Studio").
import { defineSite, f, single } from '@lupinum/ginko'
import { downloads, events, jobs, legal, notices, people, posts, site } from '@lupinum/ginko/basics'
import { logos, quotes } from './app/bricks/logos-quotes.ts'
import { pages } from './app/bricks/pages.ts'
import { services } from './app/bricks/services.ts'
import { locales, localized } from './app/routes.ts'
import { siteUrl } from './site-url.ts'

export default defineSite({
  site: 'company',
  name: 'Halden Pumps',
  // `color` fills the share cards: the light `--brand` of app/assets/css/main.css.
  seo: {
    description: 'Halden Pumps builds centrifugal and submersible pumps and complete pumping stations for water, wastewater and industry, and services them across Germany.',
    color: '#0369a1',
  },
  url: siteUrl('https://example.com'),
  timeZone: 'Europe/Berlin',
  // German public holidays, and `addressCountry` in the Organization and JobPosting JSON-LD.
  country: 'DE',
  locales,
  languages: { en: 'en-GB', de: 'de-DE' },
  // Prices of products and services.
  currency: 'EUR',
  pages: {
    home: localized('/'),
    services: localized('/services'),
    jobs: localized('/jobs'),
    news: localized('/news'),
    events: localized('/events'),
    team: localized('/contact'),
    downloads: localized('/downloads'),
  },
  bricks: {
    // The first screen of the home page: what the company makes in one sentence, a lead and the photo (content/home.md).
    home: single({
      label: { de: 'Startseite', en: 'Home page' },
      source: 'files',
      fields: {
        title: f.text({ de: 'Titel', en: 'Title' }, { max: 100 }),
        lead: f.longtext({ de: 'Einleitung', en: 'Lead' }, { max: 300 }),
        image: f.image({ de: 'Bild', en: 'Image' }, { optional: true }),
      },
    }),
    // The service line for a pump that stops: the person who answers it (phone and email from content/people/) and
    // when (content/serviceLine.md). The home page shows it in the first screen, the contact page above the people.
    serviceLine: single({
      label: { de: 'Service-Nummer', en: 'Service line' },
      source: 'files',
      fields: {
        contact: f.ref({ de: 'Wer antwortet', en: 'Who answers' }, { to: 'people' }),
        hours: f.text({ de: 'Erreichbar', en: 'Hours' }, {
          max: 80,
          hint: { de: 'Kurz, zum Beispiel „Mo–Fr 7–17 Uhr, Sa 8–12 Uhr“.', en: 'Short, for example “Mon–Fri 7:00–17:00, Sat 8:00–12:00”.' },
        }),
      },
    }),
    // Legal name, address, register entry, VAT number, phone and email for the footer, the imprint, the enquiry and
    // application emails and the Organization JSON-LD (content/site.md).
    site: site({ source: 'files' }),
    // Privacy policy, terms of sale and imprint: one file per text in content/legal/.
    legal: legal({ source: 'files', route: localized('/legal/[slug]') }),
    // Short lines at the top of every page ("Meet us at the Municipal Water Forum"), each until a date (content/notices/).
    notices: notices({ source: 'files' }),
    // Products and services, each with a fixed price or "on request", key facts and a product sheet (content/services/).
    services: services({ source: 'files', route: localized('/services/[slug]'), downloads: 'downloads' }),
    // Open jobs (content/jobs/). Each needs `validUntil`: the day after it the job leaves the list, its page, the
    // sitemap and search engines by itself. In the Studio, Today lists jobs that end within 7 days.
    jobs: { ...jobs({ source: 'files', route: localized('/jobs/[slug]') }), status: { count: true } },
    // News, newest first (content/posts/). `authors` names entries of `people`. A file with `draft: true` never goes
    // online; in the Studio, Today shows how old the newest post is and has a button to write one.
    posts: {
      ...posts({ source: 'files', authors: 'people', route: localized('/news/[slug]') }),
      drafts: true,
      status: { age: 'date' },
      tasks: [{ id: 'write', kind: 'create', label: { en: 'Write a news post', de: 'Neuigkeit schreiben' } }],
    },
    // Sales, service and the other contacts, with phone and email (content/people/). No photos: the site shows initials.
    people: people({ source: 'files' }),
    // Trade fairs where the company shows (content/events/): hall and stand as the place. A fair leaves the site after
    // its last day; the home page shows the next one, and so does Today.
    events: { ...events({ source: 'files', route: localized('/events/[slug]') }), status: { next: 'when' } },
    // Product sheets and other PDFs, newest first (content/downloads/, the files in public/sheets/). A product names
    // its sheet with `sheet`.
    downloads: downloads({ source: 'files' }),
    // Customer logos on the home page (content/logos/, the files in public/logos/).
    logos: logos({ source: 'files' }),
    // What customers say, on the home page (content/quotes/), with their permission.
    quotes: quotes({ source: 'files' }),
    // About us and any other page (content/pages/).
    pages: pages({ route: localized('/[slug]'), source: 'files' }),
  },
})
