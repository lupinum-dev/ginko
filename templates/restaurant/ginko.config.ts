// Restaurant template: a family Gasthaus in Vienna with opening hours, a menu with allergens, a lunch week, events,
// a gallery and a few free pages, in English (main), German and Italian.
// Every brick reads Markdown from content/ (source: 'files'), so the site runs without an account.
// To let the owner change a brick in Ginko Studio instead, remove `source: 'files'` from it (README, "Move to the Studio").
import { defineSite, f, single } from '@lupinum/ginko'
import { events, legal, site } from '@lupinum/ginko/basics'
import { gallery, hourPlans, hours, lunch, menu, notices } from '@lupinum/ginko-preset-gastro'
import { pages } from './app/bricks/pages.ts'
import { locales, localized } from './app/routes.ts'
import { siteUrl } from './site-url.ts'

// `weekOf`: the start value of the lunch week on the platform (a Monday); the weekly task sets the current week.
const lunchBrick = lunch({ source: 'files', weekOf: '2026-10-12' })

export default defineSite({
  site: 'restaurant',
  name: 'Gasthaus zur Linde',
  // `color` fills the share cards: the light `--brand` of app/assets/css/main.css.
  seo: { description: 'A family Gasthaus in Vienna: Viennese cooking, a lunch menu on weekdays, and a shady garden.', color: '#c2410c' },
  url: siteUrl('https://example.com'),
  timeZone: 'Europe/Vienna',
  // Austrian public holidays count for the opening hours (stored as `holidays: 'AT'`), and JSON-LD names Austria.
  country: 'AT',
  locales,
  languages: { en: 'en-GB', de: 'de-AT', it: 'it-IT' },
  currency: 'EUR',
  pages: {
    home: localized('/'),
    menu: localized('/menu'),
    lunch: localized('/lunch'),
    events: localized('/events'),
    gallery: localized('/gallery'),
    reservations: localized('/reservations'),
  },
  bricks: {
    // The home page: title, lead and photo of the first screen (content/home.md).
    home: single({
      label: { en: 'Home page', de: 'Startseite' },
      source: 'files',
      fields: {
        title: f.text({ en: 'Title', de: 'Titel' }, { max: 80, default: 'Welcome' }),
        lead: f.longtext({ en: 'Lead', de: 'Einleitung' }, { max: 300, default: 'A short introduction: who you are and what you offer.' }),
        image: f.image({ en: 'Photo', de: 'Foto' }, { optional: true }),
      },
    }),
    // The reservations page: title, lead and the text below the call and email buttons and the opening hours
    // (content/reservations.md).
    reservations: single({
      label: { en: 'Reservations', de: 'Reservierung' },
      source: 'files',
      fields: {
        title: f.text({ en: 'Title', de: 'Titel' }, { max: 80, default: 'Reservations' }),
        lead: f.longtext({ en: 'Lead', de: 'Einleitung' }, { max: 300, optional: true }),
        body: f.markdown({ en: 'Text', de: 'Text' }, { profile: 'page', optional: true }),
      },
    }),
    // Legal name, address, phone and email. One entry, used in the footer, the imprint, the reservation links and the
    // Restaurant JSON-LD. The country comes from `country` above.
    site: site({ source: 'files' }),
    // Privacy policy, terms and imprint: one file per text in content/legal/.
    legal: legal({ source: 'files', route: localized('/legal/[slug]') }),
    // Short lines at the top of every page ("Fully booked tonight"), each until a date.
    notices: notices({ source: 'files' }),
    // The usual week (two periods a day), closures such as the summer holiday, and what happens on public holidays.
    hours: hours({ source: 'files', plans: 'hourPlans' }),
    // Other weekly hours for a date range, such as winter hours that repeat every year.
    hourPlans: hourPlans({ source: 'files' }),
    // The menu: one file per dish with category, price, allergens (EU letters A–R) and vegetarian or vegan.
    menu: menu({ source: 'files' }),
    // This week's lunch, Monday to Friday. In the Studio the cook enters the week and the owner approves it.
    lunch: { ...lunchBrick, tasks: lunchBrick.tasks?.map((task) => ({ ...task, needsApproval: true })) },
    // Wine evenings, cooking classes and the like. An event leaves the site after its last day.
    events: events({ source: 'files', route: localized('/events/[slug]') }),
    // Photos of the house, the food and the garden.
    gallery: gallery({ source: 'files' }),
    // Free pages such as About: content/pages/.
    pages: pages({ route: localized('/[slug]'), source: 'files' }),
  },
})
