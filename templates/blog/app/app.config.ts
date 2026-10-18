import type { SiteAppConfig } from './composables/useSiteAppConfig'

// The brand and navigation of the site. The name is `name` in ginko.config.ts; colours and fonts are in
// app/assets/css/main.css; the contact email is in content/site.md.
export default defineAppConfig({
  site: {
    // logo: { src: '/logo.svg', width: 120, height: 32 },
    // One line under the name in the footer, per language.
    tagline: {
      en: 'Notes on the nature in and around the city.',
      de: 'Notizen über die Natur in und um die Stadt.',
    },
    organization: 'Organization',
    // At most 6. A page of ginko.config.ts (`page`, with its label per language; keep it the same as the page's title).
    nav: [
      { page: 'news', label: { en: 'Posts', de: 'Beiträge' } },
      { page: 'team', label: { en: 'About', de: 'Über uns' } },
    ],
    footer: [],
    // For example { label: 'Mastodon', url: 'https://mastodon.social/@fieldnotes' }.
    socials: [],
  } satisfies SiteAppConfig,
  // Following the blog, shown in the footer of every page (app/components/site/FooterStatus.vue) next to the feed.
  blog: {
    // The sign-up page of your newsletter at a newsletter service, for example 'https://fieldnotes.example.com/subscribe'.
    // Empty: no newsletter link. The site itself has no form and sends no data to the service.
    newsletter: '',
  },
})
