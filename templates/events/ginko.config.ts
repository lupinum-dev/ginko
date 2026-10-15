// Events template: a two-day community conference about open data in Vienna, with its programme by day, the
// speakers, "now and next" on the event days, the ticket link, questions and answers, sponsors, last year's photos and
// a few free pages, in English (main) and German. Every brick reads Markdown from content/ (source: 'files'), so the
// site runs without an account. To let the team change a brick in Ginko Studio later, remove `source: 'files'` from it
// (README, "Move to the Studio").
import { defineSite, f, single } from '@lupinum/ginko'
import { events, faq, gallery, legal, notices, people, sessions, site } from '@lupinum/ginko/basics'
import { logos } from './app/bricks/logos-quotes.ts'
import { pages } from './app/bricks/pages.ts'
import { locales, localized } from './app/routes.ts'
import { siteUrl } from './site-url.ts'

export default defineSite({
  site: 'events',
  name: 'Open Data Days',
  // `color` fills the share cards: the light `--brand` of app/assets/css/main.css.
  seo: {
    description: 'Open Data Days: two days of talks and workshops on open data in Vienna, for people who publish data and people who use it.',
    color: '#be123c',
  },
  url: siteUrl('https://example.com'),
  // Session times are entered and shown in this zone; JSON-LD writes them with its offset.
  timeZone: 'Europe/Vienna',
  // Austrian public holidays in the Studio, and `addressCountry` in the JSON-LD.
  country: 'AT',
  locales,
  languages: { en: 'en-GB', de: 'de-AT' },
  currency: 'EUR',
  pages: {
    home: localized('/'),
    programme: localized('/programme'),
    speakers: localized('/speakers'),
    events: localized('/events'),
    faq: localized('/faq'),
  },
  bricks: {
    // The first screen of the home page: title, lead and photo (content/home.md). Dates, place and the ticket link
    // come from the next event in content/events/.
    home: single({
      label: { de: 'Startseite', en: 'Home page' },
      source: 'files',
      fields: {
        title: f.text({ de: 'Titel', en: 'Title' }, { max: 80 }),
        lead: f.longtext({ de: 'Einleitung', en: 'Lead' }, { max: 300 }),
        image: f.image({ de: 'Bild', en: 'Image' }, { optional: true }),
      },
    }),
    // Name, address, register entry, phone and email for the footer, the imprint and the JSON-LD (content/site.md).
    site: site({ source: 'files' }),
    // Privacy policy, terms of use and imprint: one file per text in content/legal/.
    legal: legal({ source: 'files', route: localized('/legal/[slug]') }),
    // Short lines at the top of every page ("Room 2 moves to the main hall"), each until a date (content/notices/).
    notices: notices({ source: 'files' }),
    // The conference and other dates, with place, ticket link and price (content/events/). An event leaves the site
    // after its last day; the home page shows the next one, and so does Today in the Studio.
    events: { ...events({ source: 'files', route: localized('/events/[slug]') }), status: { next: 'when' } },
    // The programme: one file per session with its event, day, start and end time, room, speakers and state
    // (content/sessions/). A session leaves the site after its day.
    sessions: sessions({ source: 'files', people: 'people' }),
    // The speakers, each with a page (content/people/). No photos: the site shows initials. Today counts the speakers
    // without a short bio.
    people: {
      ...people({ source: 'files', route: localized('/speakers/[slug]'), label: { de: 'Vortragende', en: 'Speakers', es: 'Ponentes', fr: 'Intervenants' } }),
      status: { missing: 'bio' },
    },
    // Questions and answers: getting there, access, food, the code of conduct (content/faq/).
    faq: faq({ source: 'files' }),
    // Sponsor and partner logos on the home page (content/logos/, the files in public/logos/).
    logos: logos({ source: 'files' }),
    // Photos of last year's conference on the home page (content/gallery.md).
    gallery: gallery({ source: 'files' }),
    // Venue, code of conduct, sponsoring and any other page (content/pages/).
    pages: pages({ route: localized('/[slug]'), source: 'files' }),
  },
})
