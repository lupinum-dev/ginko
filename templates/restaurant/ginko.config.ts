// Restaurant template: a family Gasthaus in Vienna with opening hours, a menu with allergens, a lunch week, events,
// a gallery and a few free pages, in English (main), German and Italian.
// Every brick reads Markdown from content/ (source: 'files'), so the site runs without an account.
// To let the owner change a brick in Ginko Studio instead, remove `source: 'files'` from it.
import { collection, defineSite, f } from '@lupinum/ginko'
import { legal, site } from '@lupinum/ginko/basics'
import { events, gallery, hourPlans, hours, lunch, menu, notices } from '@lupinum/ginko-preset-gastro'

const lunchBrick = lunch({ source: 'files' })

export default defineSite({
  site: 'restaurant',
  name: 'Gasthaus zur Linde',
  seo: { description: 'A family Gasthaus in Vienna: Viennese cooking, a lunch menu on weekdays, and a garden under chestnut trees.' },
  url: 'https://example.com',
  timeZone: 'Europe/Vienna',
  // Austrian public holidays count for the opening hours (stored as `holidays: 'AT'`), and JSON-LD names Austria.
  country: 'AT',
  locales: ['en', 'de', 'it'],
  languages: { en: 'en-GB', de: 'de-AT', it: 'it-IT' },
  currency: 'EUR',
  pages: {
    home: { en: '/', de: '/de', it: '/it' },
    menu: { en: '/menu', de: '/de/speisekarte', it: '/it/menu' },
    lunch: { en: '/lunch', de: '/de/mittagsmenue', it: '/it/pranzo' },
    events: { en: '/events', de: '/de/veranstaltungen', it: '/it/eventi' },
    gallery: { en: '/gallery', de: '/de/galerie', it: '/it/galleria' },
  },
  bricks: {
    // Legal name, address, phone and email. One entry, used in the footer, the imprint, the reservation page and the
    // Restaurant JSON-LD. The country comes from `country` above.
    site: site({ source: 'files' }),
    // Privacy policy, terms and imprint: one file per text in content/legal/. Address: /legal/<slug>.
    legal: legal({ source: 'files', route: { en: '/legal/[slug]', de: '/de/rechtliches/[slug]', it: '/it/legale/[slug]' } }),
    // Short lines at the top of every page ("Fully booked tonight"), each until a date; up to 5.
    notices: notices({ source: 'files' }),
    // The usual week (two periods a day), closures such as the summer holiday, and what happens on public holidays.
    hours: hours({ source: 'files' }),
    // Other weekly hours for a date range, such as winter hours that repeat every year.
    hourPlans: hourPlans({ source: 'files' }),
    // The menu: one file per dish with category, price, allergens (EU letters A–R) and vegetarian or vegan.
    menu: menu({ source: 'files' }),
    // This week's lunch, Monday to Friday. In the Studio the cook enters the week and the owner approves it.
    lunch: { ...lunchBrick, tasks: lunchBrick.tasks?.map((task) => ({ ...task, needsApproval: true })) },
    // Wine evenings, cooking classes and the like. An event leaves the site after its day.
    events: events({ source: 'files', route: { en: '/events/[slug]', de: '/de/veranstaltungen/[slug]', it: '/it/eventi/[slug]' } }),
    // Photos of the house, the food and the garden (up to 24).
    gallery: gallery({ source: 'files' }),
    // Free pages such as About and Reservations. Address: /<slug>.
    pages: collection({
      label: { en: 'Pages', de: 'Seiten' },
      source: 'files',
      fields: {
        title: f.text({ en: 'Title', de: 'Titel' }, { max: 80 }),
        slug: f.slug({ en: 'Web address', de: 'Adresse' }, { from: 'title' }),
        summary: f.longtext({ en: 'Summary', de: 'Kurzbeschreibung' }, { max: 300, optional: true }),
        image: f.image({ en: 'Image', de: 'Bild' }, { optional: true }),
        body: f.markdown({ en: 'Text', de: 'Text' }, { profile: 'page' }),
      },
      max: 50,
      order: 'manual',
      route: { en: '/[slug]', de: '/de/[slug]', it: '/it/[slug]' },
    }),
  },
})
