import type { SiteAppConfig } from './composables/useSiteAppConfig'

// The brand and navigation of the site. The name is `name` in ginko.config.ts; colours and fonts are in
// app/assets/css/main.css; address and contact are in content/site.md.
export default defineAppConfig({
  site: {
    // shortName: 'Pw', // shown on phones instead of the name
    // logo: { src: '/logo.svg', width: 140, height: 32 },
    // One line under the name in the footer, per language.
    tagline: {
      en: 'Shift planning for care homes and small clinics.',
      de: 'Dienstplanung für Pflegeheime und kleine Kliniken.',
      fr: 'La planification des équipes pour les EHPAD et les petites cliniques.',
    },
    organization: 'Organization',
    // At most 6. A page of ginko.config.ts (`page`, with its label per language; keep it the same as the page's
    // title) or an entry of content/pages/ by id (`pages/<file name without number>`).
    nav: [
      { page: 'pricing', label: { en: 'Pricing', de: 'Preise', fr: 'Tarifs' } },
      { page: 'changelog', label: { en: 'Changelog', de: 'Neuerungen', fr: 'Nouveautés' } },
      { url: '/docs', label: { en: 'Docs', de: 'Doku', fr: 'Docs' } },
      { page: 'faq', label: { en: 'FAQ', de: 'Häufige Fragen', fr: 'Questions fréquentes' } },
      { entry: 'pages/contact' },
    ],
    footer: [
      { entry: 'pages/security' },
      { entry: 'pages/about' },
      { page: 'news', label: { en: 'Blog', de: 'Blog', fr: 'Blog' } },
      // The sign-in of the app, for customers: a quiet link here and in the phone menu, no second button in the header.
      { url: 'https://app.planwerk.example/login', label: { en: 'Sign in', de: 'Anmelden', fr: 'Se connecter' } },
    ],
    // For example { label: 'LinkedIn', url: 'https://www.linkedin.com/company/planwerk' }.
    socials: [],
    // Prices to businesses, plus VAT: the pricing page says so, and so does the prices' JSON-LD.
    vat: 'excluded',
  } satisfies SiteAppConfig,
})
