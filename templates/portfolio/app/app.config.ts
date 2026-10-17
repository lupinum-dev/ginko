import type { SiteAppConfig } from './composables/useSiteAppConfig'

// The brand and navigation of the site. The name is `name` in ginko.config.ts; colours and fonts are in
// app/assets/css/main.css; address and contact are in content/site.md.
export default defineAppConfig({
  site: {
    // logo: { src: '/logo.svg', width: 160, height: 32 },
    // One line under the name in the footer, per language.
    tagline: {
      en: 'Interiors, furniture and objects, designed in Hamburg.',
      de: 'Räume, Möbel und Objekte, entworfen in Hamburg.',
    },
    // The home page tells search engines that the studio is a ProfessionalService (a LocalBusiness with an address).
    organization: 'LocalBusiness',
    // At most 6. A page of ginko.config.ts (`page`, with its label per language; keep it the same as the page's
    // title) or an entry of content/pages/ by id (`pages/<file name without number>`).
    nav: [
      { page: 'projects', label: { en: 'Work', de: 'Projekte' } },
      { page: 'team', label: { en: 'Studio', de: 'Studio' } },
      { entry: 'pages/how-we-work' },
      { page: 'news', label: { en: 'Journal', de: 'Journal' } },
    ],
    footer: [],
    // For example { label: 'Instagram', url: 'https://www.instagram.com/studio-maren-holt' }.
    socials: [],
  } satisfies SiteAppConfig,
})
