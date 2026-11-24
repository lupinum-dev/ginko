// Company template: a mid-sized German maker of industrial pumps and pumping stations with its products and services,
// open jobs, news, sales and service contacts, customers and references, product sheets to download and the trade
// fairs where it shows, in English (main) and German. Every brick reads Markdown from content/, so the site runs
// without an account. To let the team change a brick in Ginko Studio later, name it in `studio.bricks`
// (README, "Move to the Studio").
import { defineSite, extend, f, single } from '@lupinum/ginko'
import { downloads, events, jobs, legal, notices, people, posts, site } from '@lupinum/ginko/patterns'
import { logos, quotes } from './app/bricks/logos-quotes.ts'
import { pages } from './app/bricks/pages.ts'
import { servicesWithSheets } from './app/bricks/services.ts'
import { locales, localized } from './app/routes.ts'
import { siteUrl } from './site-url.ts'

export default defineSite({
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
  // The site's id on a Ginko platform, and the bricks the team edits in Ginko Studio: none yet, every brick is in files.
  studio: { id: 'company', bricks: [] },
  // The fixed pages. `localized` gives the path in each language with the words of app/routes.ts; Ginko adds `/de`.
  pages: {
    home: localized('/'),
    services: localized('/services'),
    jobs: localized('/jobs'),
    news: localized('/news'),
    events: localized('/events'),
    team: localized('/contact'),
    downloads: localized('/downloads'),
  },
  // The page of one entry, by brick.
  entries: {
    legal: localized('/legal/[slug]'),
    services: localized('/services/[slug]'),
    jobs: localized('/jobs/[slug]'),
    posts: localized('/news/[slug]'),
    events: localized('/events/[slug]'),
    pages: localized('/[slug]'),
  },
  bricks: {
    // The first screen of the home page: what the company makes in one sentence, a lead and the photo (content/home.md).
    home: single({
      label: { de: 'Startseite', en: 'Home page' },
      fields: {
        title: f.text({ de: 'Titel', en: 'Title' }, { max: 100, default: 'Welcome' }),
        lead: f.longtext({ de: 'Einleitung', en: 'Lead' }, { max: 300, default: 'A short introduction: who you are and what you offer.' }),
        image: f.image({ de: 'Bild', en: 'Image' }, { optional: true }),
      },
    }),
    // The service line for a pump that stops: the person who answers it (phone and email from content/people/) and
    // when (content/serviceLine.md). The home page shows it in the first screen, the contact page above the people.
    serviceLine: single({
      label: { de: 'Service-Nummer', en: 'Service line' },
      fields: {
        contact: f.ref({ de: 'Wer antwortet', en: 'Who answers' }, { to: 'people', optional: true }),
        hours: f.text({ de: 'Erreichbar', en: 'Hours' }, {
          max: 80,
          default: 'Mon–Fri 8:00–17:00',
          hint: { de: 'Kurz, zum Beispiel „Mo–Fr 7–17 Uhr, Sa 8–12 Uhr“.', en: 'Short, for example “Mon–Fri 7:00–17:00, Sat 8:00–12:00”.' },
        }),
      },
    }),
    // Legal name, address, register entry, VAT number, phone and email for the footer, the imprint, the enquiry and
    // application emails and the Organization JSON-LD (content/site.md).
    site,
    // Privacy policy, terms of sale and imprint: one file per text in content/legal/.
    legal,
    // Short lines at the top of every page ("Meet us at the Municipal Water Forum"), each until a date (content/notices/).
    notices,
    // Products and services, each with a fixed price or "on request", key facts and a product sheet (content/services/).
    services: servicesWithSheets,
    // Open jobs (content/jobs/). Each needs `validUntil`: the day after it the job leaves the list, its page, the
    // sitemap and search engines by itself. In the Studio, Today lists jobs that end within 7 days.
    jobs,
    // News, newest first (content/posts/). `authors` names entries of `people`. A file with `draft: true` never goes
    // online; in the Studio, Today shows how old the newest post is and has a button to write one.
    posts: extend(posts, {
      status: { show: 'newest', field: 'date' },
      tasks: [{ id: 'write', kind: 'create', label: { en: 'Write a news post', de: 'Neuigkeit schreiben' } }],
    }),
    // Sales, service and the other contacts, with phone and email (content/people/). No photos: the site shows initials.
    people,
    // Trade fairs where the company shows (content/events/): hall and stand as the place. A fair leaves the site after
    // its last day; the home page shows the next one, and so does Today.
    events,
    // Product sheets and other PDFs, newest first (content/downloads/, the files in public/sheets/). A product names
    // its sheet with `sheet`.
    downloads,
    // Customer logos on the home page (content/logos/, the files in public/logos/).
    logos,
    // What customers say, on the home page (content/quotes/), with their permission.
    quotes,
    // About us and any other page (content/pages/).
    pages,
  },
})
