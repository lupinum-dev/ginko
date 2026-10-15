// Nonprofit template: a river clean-up and community association in Germany with news, events, the board and team,
// reports to download and a few free pages, in English (main), German, French and Arabic (right to left).
// Every brick reads Markdown from content/ (source: 'files'), so the site runs without an account.
// To let the team change a brick in Ginko Studio instead, remove `source: 'files'` from it.
import { collection, defineSite, f } from '@lupinum/ginko'
import { downloads, events, legal, notices, people, posts, site } from '@lupinum/ginko/basics'

const newsBrick = posts({ source: 'files', authors: 'people', route: { en: '/news/[slug]', de: '/de/aktuelles/[slug]', fr: '/fr/actualites/[slug]', ar: '/ar/akhbar/[slug]' } })
const eventsBrick = events({ source: 'files', route: { en: '/events/[slug]', de: '/de/termine/[slug]', fr: '/fr/evenements/[slug]', ar: '/ar/faaliyat/[slug]' } })

export default defineSite({
  site: 'nonprofit',
  name: 'River Commons',
  seo: { description: 'River Commons is an association of neighbours who keep the river clean, test its water and plant its banks.' },
  url: 'https://example.com',
  timeZone: 'Europe/Berlin',
  // German public holidays, and `addressCountry` in the NGO JSON-LD.
  country: 'DE',
  locales: ['en', 'de', 'fr', 'ar'],
  languages: { en: 'en-GB', de: 'de-DE', fr: 'fr-FR', ar: 'ar' },
  currency: 'EUR',
  pages: {
    home: { en: '/', de: '/de', fr: '/fr', ar: '/ar' },
    news: { en: '/news', de: '/de/aktuelles', fr: '/fr/actualites', ar: '/ar/akhbar' },
    events: { en: '/events', de: '/de/termine', fr: '/fr/evenements', ar: '/ar/faaliyat' },
    team: { en: '/team', de: '/de/team', fr: '/fr/equipe', ar: '/ar/fariq' },
    reports: { en: '/reports', de: '/de/berichte', fr: '/fr/rapports', ar: '/ar/taqarir' },
  },
  bricks: {
    // Legal name, address, register entry, phone and email. One entry, used in the footer, the imprint and the NGO
    // JSON-LD. The country comes from `country` above.
    site: site({ source: 'files' }),
    // Privacy policy, terms of use and imprint: one file per text in content/legal/. Address: /legal/<slug>.
    legal: legal({ source: 'files', route: { en: '/legal/[slug]', de: '/de/rechtliches/[slug]', fr: '/fr/informations-legales/[slug]', ar: '/ar/qanuni/[slug]' } }),
    // Short lines at the top of every page ("The annual report is online"), each until a date; up to 5.
    notices: notices({ source: 'files' }),
    // News, newest first. `authors` names entries of `people`. Volunteers write drafts (`draft: true` in the file);
    // in the Studio their posts go live after a check, and Today shows how old the newest post is.
    posts: {
      ...newsBrick,
      drafts: true,
      status: { age: 'date' },
      tasks: [{ id: 'write', kind: 'create', label: { en: 'Write a news post', de: 'Neuigkeit schreiben', fr: 'Écrire une actualité' }, needsApproval: true }],
    },
    // The board and the staff. No photos: the site shows initials.
    people: people({ source: 'files' }),
    // Clean-ups, meetings and other dates. An event leaves the site after its last day; Today shows the next one.
    events: { ...eventsBrick, status: { next: 'when' } },
    // Reports and other PDFs, newest first.
    downloads: downloads({ source: 'files' }),
    // Free pages such as About, Get involved and Donate. Address: /<slug>.
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
      route: { en: '/[slug]', de: '/de/[slug]', fr: '/fr/[slug]', ar: '/ar/[slug]' },
    }),
  },
})
