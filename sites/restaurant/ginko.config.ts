// Gasthaus zur Linde: the v1 acceptance target (SPEC 13, DEMOS.md demo 3).
// Hours, notices, lunch, menu, events and gallery come from the gastro preset; the rest is this house's own.
import { defineSite, extend, f, single, type TaskInput } from '@lupinum/ginko'
import { events, gallery, hourPlans, hours, lunch, lunchPlans, menu, notices } from '@lupinum/ginko-preset-gastro'

/** The preset's menu with its own tasks; this house adds two tasks with an end (below). */
const dishes = menu()

export default defineSite({
  name: 'Gasthaus zur Linde',
  url: 'https://ginko-demo-restaurant.vercel.app',
  timeZone: 'Europe/Vienna',
  locales: ['de', 'en'],
  languages: { de: 'de-AT', en: 'en-GB' },
  currency: 'EUR',
  // The site's week: the lunch week starts on this day.
  week: { firstDay: 'mo', workdays: ['mo', 'tu', 'we', 'th', 'fr'] },
  // Austrian public holidays for the opening hours (stored as `holidays: 'AT'`).
  country: 'AT',
  // The site's id on the platform. Every brick is edited in Ginko Studio.
  studio: { id: 'restaurant', bricks: 'all' },
  // Paths are written without the language prefix: Ginko adds `/en`.
  pages: {
    home: '/',
    menu: { de: '/speisekarte', en: '/menu' },
    lunch: { de: '/mittagsmenue', en: '/lunch' },
    events: { de: '/veranstaltungen', en: '/events' },
    gallery: { de: '/galerie', en: '/gallery' },
    imprint: { de: '/impressum', en: '/imprint' },
    privacy: { de: '/datenschutz', en: '/privacy' },
  },
  // The page of one event.
  entries: {
    events: { de: '/veranstaltungen/[slug]', en: '/events/[slug]' },
  },
  bricks: {
    // Schnell ändern lists bricks in this order, so each plan sits right after the brick it plans.
    hours: hours({ plans: 'hourPlans' }),
    // Seasons and "new hours from a date"; data only, no page of its own.
    hourPlans: hourPlans(),
    notices: notices(),
    // The cook enters the week's lunch menu; it goes live once the owner approves it (SPEC 17).
    lunch: extend(lunch({ weekOf: '2026-10-05', needsApproval: true }), { preview: 'lunch' }),
    // Lunch weeks planned ahead, shown from their first day of the week (lunchWeekOn).
    lunchPlans: lunchPlans(),
    // The menu's fields named: the new tasks' `fields` and `set` would otherwise take part in guessing them.
    menu: extend<typeof dishes.fields>(dishes, {
      preview: 'menu',
      tasks: [
        // A made brick keeps its tasks with plain field names (`Def.tasks`): typed by the menu's fields again here, as
        // the preset does for its own `soldOut` task.
        ...((dishes.tasks ?? []) as readonly TaskInput<typeof dishes.fields>[]),
        // A price for some days; the normal price comes back by itself after the last day.
        { id: 'offer', label: { de: 'Aktionspreis', en: 'Special price' }, fields: ['price'], when: { from: 'ask', until: 'ask' } },
        // One press: the dish is off the website today and back tomorrow; the entry keeps "on the menu".
        { id: 'offToday', label: { de: 'Heute nicht auf der Karte', en: 'Not on the menu today' }, fields: [], when: { from: '@today', until: '@today' }, set: { onMenu: false } },
      ],
    }),
    events: events(),
    gallery: extend(gallery(), { preview: 'gallery' }),
    // A rare job (moving, new number): no quick task, found under this label in Alles bearbeiten.
    contact: single({
      label: 'Adresse und Kontakt',
      fields: {
        street: f.text('Straße und Hausnummer', { group: { de: 'Adresse', en: 'Address' }, max: 80, translate: false, default: 'Dorfstraße 12' }),
        postalCode: f.text({ de: 'PLZ', en: 'Postal code' }, { group: { de: 'Adresse', en: 'Address' }, max: 10, translate: false, optional: true, default: '5020' }),
        city: f.text('Ort', { group: { de: 'Adresse', en: 'Address' }, max: 80, translate: false, default: 'Salzburg' }),
        phone: f.text('Telefon', { group: { de: 'Erreichbarkeit', en: 'How to reach you' }, format: 'tel', default: '+43 662 000 000' }),
        email: f.text('E-Mail', { group: { de: 'Erreichbarkeit', en: 'How to reach you' }, format: 'email', optional: true, default: 'office@gasthaus-linde.example' }),
      },
    }),
    legal: single({
      label: 'Rechtliches',
      // Two long texts: one tab each on wide screens, one below the other on phones.
      layout: 'tabs',
      fields: {
        imprint: f.markdown('Impressum', { group: 'Impressum', profile: 'basic', translate: 'manual', optional: true }),
        privacy: f.markdown('Datenschutz', { group: 'Datenschutz', profile: 'basic', translate: 'manual', optional: true }),
      },
    }),
    seo: single({
      label: 'Suchmaschinen',
      fields: {
        title: f.text('Titel', { max: 70, default: { de: 'Gasthaus zur Linde, Salzburg' } }),
        description: f.text('Beschreibung', { max: 160, default: { de: 'Wirtshausküche in Salzburg: Mittagsmenü, Speisekarte und Veranstaltungen.' } }),
        image: f.image('Vorschaubild', { optional: true }),
      },
    }),
  },
})
