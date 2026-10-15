import type { SiteAppConfig } from './composables/useSiteAppConfig'

// The brand and navigation of the site. The name is `name` in ginko.config.ts; colours and fonts are in
// app/assets/css/main.css; address and contact are in content/site.md.
export default defineAppConfig({
  site: {
    shortName: 'Open Data Days',
    // logo: { src: '/logo.svg', width: 120, height: 32 },
    // One line under the name in the footer, per language.
    tagline: {
      en: 'A community conference about open data in Vienna.',
      de: 'Eine Community-Konferenz über offene Daten in Wien.',
    },
    organization: 'Organization',
    // At most 6. A page of ginko.config.ts (`page`, with its label per language; keep it the same as the page's
    // title) or an entry of content/pages/ by id (`pages/<file name without number>`).
    nav: [
      { page: 'programme', label: { en: 'Programme', de: 'Programm' } },
      { page: 'speakers', label: { en: 'Speakers', de: 'Vortragende' } },
      { entry: 'pages/venue' },
      { page: 'faq', label: { en: 'FAQ', de: 'Häufige Fragen' } },
    ],
    footer: [
      { page: 'events', label: { en: 'Dates', de: 'Termine' } },
      { entry: 'pages/code-of-conduct' },
      { entry: 'pages/sponsoring' },
    ],
    // For example { label: 'Mastodon', url: 'https://mastodon.social/@opendatadays' }.
    socials: [],
  } satisfies SiteAppConfig,
})
