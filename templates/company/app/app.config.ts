import type { SiteAppConfig } from './composables/useSiteAppConfig'

// The brand and navigation of the site. The name (header, footer, page titles) is `name` in ginko.config.ts; colours and fonts are in
// app/assets/css/main.css; address and contact are in content/site.md.
export default defineAppConfig({
  site: {
    // shortName: 'Halden', // the name on phones, when the full name is long
    // logo: { src: '/logo.svg', width: 140, height: 32 },
    // One line under the name in the footer, per language.
    tagline: {
      en: 'Pumps and pumping stations for water, wastewater and industry.',
      de: 'Pumpen und Pumpstationen für Wasser, Abwasser und Industrie.',
    },
    organization: 'Organization',
    // At most 6. A page of ginko.config.ts (`page`, with its label per language; keep it the same as the page's
    // title) or an entry of content/pages/ by id (`pages/<file name without number>`).
    nav: [
      { page: 'services', label: { en: 'Products and services', de: 'Produkte und Leistungen' } },
      { entry: 'pages/about' },
      { page: 'news', label: { en: 'News', de: 'Aktuelles' } },
      { page: 'events', label: { en: 'Trade fairs', de: 'Messen' } },
      { page: 'jobs', label: { en: 'Jobs', de: 'Karriere' } },
      { page: 'team', label: { en: 'Contact', de: 'Kontakt' } },
    ],
    footer: [
      { page: 'downloads', label: { en: 'Downloads', de: 'Downloads' } },
    ],
    // For example { label: 'LinkedIn', url: 'https://www.linkedin.com/company/halden-pumps' }.
    socials: [],
    // Prices to businesses, plus VAT: the price label says so, and so does the price's JSON-LD.
    vat: 'excluded',
  } satisfies SiteAppConfig,
})
