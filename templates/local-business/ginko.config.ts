// Local business template: a physiotherapy practice in Graz with its opening hours (closures, public holidays, hours
// from a date), treatments with price and duration, the therapists, questions and answers, photos of the practice and
// how to book and find it, in English (main) and German. Every brick reads Markdown from content/ (source: 'files'),
// so the site runs without an account. To let the practice change a brick in Ginko Studio later, remove
// `source: 'files'` from it (README, "Move to the Studio").
import { defineSite, f, single } from '@lupinum/ginko'
import { faq, gallery, hourPlans, hours, legal, notices, people, site } from '@lupinum/ginko/basics'
import { pages } from './app/bricks/pages.ts'
import { services } from './app/bricks/services.ts'
import { locales, localized } from './app/routes.ts'
import { siteUrl } from './site-url.ts'

export default defineSite({
  site: 'local-business',
  name: 'Hofer Physio',
  // `color` fills the share cards: the light `--brand` of app/assets/css/main.css.
  seo: {
    description: 'Hofer Physio is a physiotherapy practice in Graz: physiotherapy, manual therapy, sports physiotherapy, lymphatic drainage and massage, by appointment.',
    color: '#0f766e',
  },
  url: siteUrl('https://example.com'),
  timeZone: 'Europe/Vienna',
  // Austrian public holidays count for the opening hours (stored as `holidays: 'AT'`), and JSON-LD names Austria.
  country: 'AT',
  locales,
  languages: { en: 'en-GB', de: 'de-AT' },
  // Prices of the treatments.
  currency: 'EUR',
  pages: {
    home: localized('/'),
    services: localized('/services'),
    team: localized('/team'),
    faq: localized('/faq'),
    contact: localized('/contact'),
  },
  bricks: {
    // In the order of the Studio's Today page: the hours, the notices, the treatments and the team first.
    // The usual week, closures such as the Christmas break, and closed on public holidays (content/hours.md). In the
    // Studio, Today shows today's hours, and "Closed today" is one task.
    hours: hours({ source: 'files', plans: 'hourPlans' }),
    // Short lines at the top of every page ("The courtyard is closed for building work"), each until a date
    // (content/notices/).
    notices: notices({ source: 'files' }),
    // Treatments with their price (or "on request", as an explicit choice) and duration (content/services/).
    services: services({ source: 'files', route: localized('/services/[slug]') }),
    // The therapists and the front desk, with their qualifications (content/people/). No photos: the site shows initials.
    people: people({ source: 'files' }),
    // Other weekly hours for a date range, such as shorter summer hours that repeat every year (content/hourPlans/).
    hourPlans: hourPlans({ source: 'files' }),
    // How to book and how to get here (content/visit.md): when the phone is answered, an online booking page if the
    // practice uses one, and access, parking and public transport. The contact page and the home page show it; the
    // address, phone and email come from content/site.md.
    visit: single({
      label: { de: 'Termine und Anfahrt', en: 'Appointments and directions' },
      source: 'files',
      fields: {
        phoneHours: f.text({ de: 'Telefonisch erreichbar', en: 'Phone hours' }, {
          max: 80,
          default: 'Mon–Fri 8:00–12:00',
          hint: { de: 'Kurz, zum Beispiel „Mo–Fr 08:00–12:00“.', en: 'Short, for example “Mon–Fri 08:00–12:00”.' },
        }),
        bookingUrl: f.text({ de: 'Online-Terminbuchung', en: 'Online booking' }, {
          format: 'url',
          optional: true,
          hint: { de: 'Die Adresse Ihrer Buchungsseite, falls Sie eine nutzen. Leer: Termine per Telefon und E-Mail.', en: 'The address of your booking page, if you use one. Empty: appointments by phone and email.' },
        }),
        access: f.longtext({ de: 'Barrierefreiheit', en: 'Access' }, { max: 300, optional: true }),
        parking: f.longtext({ de: 'Parken', en: 'Parking' }, { max: 300, optional: true }),
        transit: f.longtext({ de: 'Öffentliche Verkehrsmittel', en: 'Public transport' }, { max: 300, optional: true }),
      },
      tasks: [
        { id: 'phone', kind: 'edit', fields: ['phoneHours', 'bookingUrl'], label: { de: 'Telefonzeiten ändern', en: 'Change the phone hours' } },
        { id: 'directions', kind: 'edit', fields: ['access', 'parking', 'transit'], label: { de: 'Anfahrt ändern', en: 'Change the directions' } },
      ],
    }),
    // Questions and answers: prescription and insurance, what to bring, cancelling (content/faq/).
    faq: faq({ source: 'files' }),
    // Photos of the practice on the contact page (content/gallery.md).
    gallery: gallery({ source: 'files' }),
    // The first screen of the home page: the practice's name, one line about it and an optional photo (content/home.md).
    home: single({
      label: { de: 'Startseite', en: 'Home page' },
      source: 'files',
      fields: {
        title: f.text({ de: 'Titel', en: 'Title' }, { max: 80, default: 'Welcome' }),
        lead: f.longtext({ de: 'Einleitung', en: 'Lead' }, { max: 200, default: 'A short introduction: who you are and what you offer.' }),
        image: f.image({ de: 'Foto', en: 'Photo' }, { optional: true }),
      },
    }),
    // About the practice and any other page (content/pages/).
    pages: pages({ route: localized('/[slug]'), source: 'files' }),
    // Legal name, address, phone and email for the footer, the imprint, the call and email buttons and the
    // Physiotherapy JSON-LD (content/site.md). The country comes from `country` above.
    site: site({ source: 'files' }),
    // Privacy policy, payment and cancellation terms, imprint: one file per text in content/legal/.
    legal: legal({ source: 'files', route: localized('/legal/[slug]') }),
  },
})
