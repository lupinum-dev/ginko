import type { SiteAppConfig } from './composables/useSiteAppConfig'

// The brand and navigation of the site. The name is `name` in ginko.config.ts; colours and fonts are in
// app/assets/css/main.css; address and contact are in content/site.md.
export default defineAppConfig({
  site: {
    // logo: { src: '/logo.svg', width: 140, height: 32 },
    // One line under the name in the footer, per language.
    tagline: {
      en: 'Physiotherapy in Graz, by appointment.',
      de: 'Physiotherapie in Graz, nach Terminvereinbarung.',
    },
    // The schema.org type of the home page's organisation. This home page makes it `Physiotherapy` (a kind of
    // LocalBusiness) with the opening hours (app/pages/index.vue); remove that, and this applies.
    organization: 'LocalBusiness',
    // At most 6. A page of ginko.config.ts (`page`, with its label per language; keep it the same as the page's
    // title) or an entry of content/pages/ by id (`pages/<file name without number>`).
    nav: [
      { page: 'services', label: { en: 'Treatments', de: 'Behandlungen' } },
      { page: 'team', label: { en: 'Team', de: 'Team' } },
      { entry: 'pages/about' },
      { page: 'faq', label: { en: 'FAQ', de: 'Häufige Fragen' } },
      { page: 'contact', label: { en: 'Contact', de: 'Kontakt' } },
    ],
    footer: [],
    // For example { label: 'Instagram', url: 'https://www.instagram.com/…' }.
    socials: [],
    // No `vat`: physiotherapy is a medical treatment and exempt from VAT in Austria, so the labels say "Price" with no
    // VAT note. Set `vat: 'included'` when your prices include VAT ("Price (incl. VAT)", also for search engines), or
    // `vat: 'excluded'` for net prices to businesses.
  } satisfies SiteAppConfig,
})
