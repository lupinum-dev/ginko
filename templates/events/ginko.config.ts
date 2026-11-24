// Events template: a two-day community conference about open data in Vienna, with its programme by day, the
// speakers, "now and next" on the event days, the ticket link, questions and answers, sponsors, last year's photos and
// a few free pages, in English (main) and German. Every brick reads Markdown from content/, so the
// site runs without an account. To let the team change a brick in Ginko Studio later, name it in `studio.bricks`
// (README, "Move to the Studio").
import { defineSite, extend, f, single } from '@lupinum/ginko'
import { events, faq, gallery, legal, notices, people, sessions, site } from '@lupinum/ginko/patterns'
import { logos } from './app/bricks/logos-quotes.ts'
import { pages } from './app/bricks/pages.ts'
import { locales, localized } from './app/routes.ts'
import { siteUrl } from './site-url.ts'

export default defineSite({
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
  // The site's id on a Ginko platform, and the bricks the team edits in Ginko Studio: none yet, every brick is in files.
  studio: { id: 'events', bricks: [] },
  // The fixed pages. `localized` gives the path in each language with the words of app/routes.ts; Ginko adds `/de`.
  pages: {
    home: localized('/'),
    programme: localized('/programme'),
    speakers: localized('/speakers'),
    events: localized('/events'),
    faq: localized('/faq'),
  },
  // The page of one entry, by brick.
  entries: {
    legal: localized('/legal/[slug]'),
    events: localized('/events/[slug]'),
    people: localized('/speakers/[slug]'),
    pages: localized('/[slug]'),
  },
  bricks: {
    // The first screen of the home page: title, lead and photo (content/home.md). Dates, place and the ticket link
    // come from the next event in content/events/.
    home: single({
      label: { de: 'Startseite', en: 'Home page' },
      fields: {
        title: f.text({ de: 'Titel', en: 'Title' }, { max: 80, default: 'Welcome' }),
        lead: f.longtext({ de: 'Einleitung', en: 'Lead' }, { max: 300, default: 'A short introduction: who you are and what you offer.' }),
        image: f.image({ de: 'Bild', en: 'Image' }, { optional: true }),
      },
    }),
    // Name, address, register entry, phone and email for the footer, the imprint and the JSON-LD (content/site.md).
    site,
    // Privacy policy, terms of use and imprint: one file per text in content/legal/.
    legal,
    // Short lines at the top of every page ("Room 2 moves to the main hall"), each until a date (content/notices/).
    notices,
    // The conference and other dates, with place, ticket link and price (content/events/). An event leaves the site
    // after its last day; the home page shows the next one, and so does Today in the Studio.
    events,
    // The programme: one file per session with its event, day, start and end time, room, speakers and state
    // (content/sessions/). A session leaves the site after its day.
    sessions,
    // The speakers, each with a page (content/people/). No photos: the site shows initials. Today counts the speakers
    // without a short bio.
    people: extend(people, {
      label: { de: 'Vortragende', en: 'Speakers', es: 'Ponentes', fr: 'Intervenants' },
      fields: { slug: f.slug({ de: 'Adresse', en: 'Address', es: 'Dirección', fr: 'Adresse' }, { from: 'name' }) },
      status: { show: 'missing', field: 'bio' },
    }),
    // Questions and answers: getting there, access, food, the code of conduct (content/faq/).
    faq,
    // Sponsor and partner logos on the home page (content/logos/, the files in public/logos/).
    logos,
    // Photos of last year's conference on the home page (content/gallery.md).
    gallery,
    // Venue, code of conduct, sponsoring and any other page (content/pages/).
    pages,
  },
})
