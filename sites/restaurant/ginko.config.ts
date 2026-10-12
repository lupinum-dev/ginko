// Gasthaus zur Linde: the v1 acceptance target (SPEC 13, DEMOS.md demo 3).
// Hours, notices, lunch, menu, events and gallery come from the gastro preset; the rest is this house's own.
import { defineSite, f, single } from '@lupinum/ginko'
import { events, gallery, hourPlans, hours, lunch, lunchPlans, menu, notices } from '@lupinum/ginko-preset-gastro'

const lunchBrick = lunch({ weekOf: '2026-10-05' })

export default defineSite({
  site: 'restaurant',
  name: 'Gasthaus zur Linde',
  url: 'https://ginko-demo-restaurant.vercel.app',
  timezone: 'Europe/Vienna',
  locales: ['de', 'en'],
  languages: { de: 'de-AT', en: 'en-GB' },
  currency: 'EUR',
  pages: {
    home: { de: '/', en: '/en' },
    menu: { de: '/speisekarte', en: '/en/menu' },
    lunch: { de: '/mittagsmenue', en: '/en/lunch' },
    events: { de: '/veranstaltungen', en: '/en/events' },
    gallery: { de: '/galerie', en: '/en/gallery' },
    imprint: { de: '/impressum', en: '/en/imprint' },
    privacy: { de: '/datenschutz', en: '/en/privacy' },
  },
  bricks: {
    hours: hours(),
    notices: notices(),
    // The cook enters the week's lunch menu; it goes live once the owner approves it (SPEC 17).
    lunch: { ...lunchBrick, tasks: lunchBrick.tasks?.map((task) => ({ ...task, needsApproval: true })) },
    menu: menu(),
    events: events({ route: { de: '/veranstaltungen/[slug]', en: '/en/events/[slug]' } }),
    gallery: gallery(),
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
    // Seasons and "new hours from a date"; data only, no page of its own. Last, so schema positions of the other bricks stay.
    hourPlans: hourPlans(),
    // Lunch weeks planned ahead; last as well. Shown from their first day of the week (lunchWeekOn).
    lunchPlans: lunchPlans(),
  },
})
