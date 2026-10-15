import type { SiteAppConfig } from './composables/useSiteAppConfig'

// The brand and navigation of the site. The name is `name` in ginko.config.ts; colours and fonts are in
// app/assets/css/main.css; address and contact are in content/site.md.
export default defineAppConfig({
  site: {
    // shortName: 'Site',
    // logo: { src: '/logo.svg', width: 120, height: 32 },
    // One line under the name in the footer, per language.
    tagline: { en: 'One line about what you do.', de: 'Eine Zeile dazu, was Sie tun.' },
    organization: 'Organization',
    // Entries of content/pages/ by id (`pages/<file name without number>`), at most 6.
    nav: [{ entry: 'pages/about' }, { entry: 'pages/contact' }],
    footer: [],
    // For example { label: 'Mastodon', url: 'https://mastodon.social/@my-site' }.
    socials: [],
  } satisfies SiteAppConfig,
})
