import type { SiteAppConfig } from './composables/useSiteAppConfig'

// The brand and navigation of the site. The name is `name` in ginko.config.ts (the header shows it, or `shortName` on
// phones when you set one); colours and fonts are in app/assets/css/main.css; address and contact are in
// content/site.md.
export default defineAppConfig({
  site: {
    // logo: { src: '/logo.svg', width: 120, height: 32 },
    // One line under the name in the footer, per language.
    tagline: {
      en: 'Neighbours who look after the river.',
      de: 'Nachbarinnen und Nachbarn, die sich um den Fluss kümmern.',
      fr: 'Des voisins qui prennent soin de la rivière.',
      ar: 'جيران يعتنون بالنهر.',
    },
    organization: 'NGO',
    // At most 6. A page of ginko.config.ts (`page`, with its label per language; keep it the same as the page's
    // title) or an entry of content/pages/ by id (`pages/<file name without number>`).
    nav: [
      { page: 'news', label: { en: 'News', de: 'Neuigkeiten', fr: 'Actualités', ar: 'الأخبار' } },
      { page: 'projects', label: { en: 'Projects', de: 'Projekte', fr: 'Projets', ar: 'المشاريع' } },
      { entry: 'pages/get-involved' },
      { entry: 'pages/about' },
      { entry: 'pages/donate' },
    ],
    footer: [
      { page: 'events', label: { en: 'Events', de: 'Veranstaltungen', fr: 'Événements', ar: 'الفعاليات' } },
      { page: 'team', label: { en: 'Team', de: 'Team', fr: 'Équipe', ar: 'الفريق' } },
      { page: 'downloads', label: { en: 'Reports', de: 'Berichte', fr: 'Rapports', ar: 'التقارير' } },
    ],
    // For example { label: 'Mastodon', url: 'https://mastodon.social/@river-commons' }.
    socials: [],
  } satisfies SiteAppConfig,
})
