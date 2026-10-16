import type { SiteAppConfig } from './composables/useSiteAppConfig'

// The brand and navigation of the site. The name is `name` in ginko.config.ts; colours and fonts are in
// app/assets/css/main.css; address and contact are in content/site.md.
export default defineAppConfig({
  site: {
    shortName: 'Planwerk',
    // logo: { src: '/logo.svg', width: 140, height: 32 },
    // One line under the name in the footer, per language.
    tagline: {
      en: 'Shift planning for care homes and small clinics.',
      de: 'Dienstplanung für Pflegeheime und kleine Kliniken.',
      fr: 'La planification des équipes pour les maisons de retraite et les petites cliniques.',
    },
    organization: 'Organization',
    // At most 6. A page of ginko.config.ts (`page`, with its label per language; keep it the same as the page's
    // title) or an entry of content/pages/ by id (`pages/<file name without number>`).
    nav: [
      { page: 'pricing', label: { en: 'Pricing', de: 'Preise', fr: 'Tarifs' } },
      { page: 'news', label: { en: 'Blog', de: 'Blog', fr: 'Blog' } },
      { page: 'changelog', label: { en: 'Changelog', de: 'Änderungen', fr: 'Nouveautés' } },
      { page: 'faq', label: { en: 'FAQ', de: 'Häufige Fragen', fr: 'Questions fréquentes' } },
    ],
    footer: [
      { entry: 'pages/security' },
      { entry: 'pages/about' },
      { entry: 'pages/contact' },
    ],
    // For example { label: 'LinkedIn', url: 'https://www.linkedin.com/company/planwerk' }.
    socials: [],
    // Prices to businesses, plus VAT: the pricing page says so, and so does the prices' JSON-LD.
    vat: 'excluded',
  } satisfies SiteAppConfig,
})
