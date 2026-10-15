import type { SiteAppConfig } from './composables/useSiteAppConfig'

// The brand and navigation of the site. The name is `name` in ginko.config.ts; colours and fonts are in
// app/assets/css/main.css; address and contact are in content/site.md.
export default defineAppConfig({
  site: {
    shortName: 'Zur Linde',
    // logo: { src: '/logo.svg', width: 120, height: 32 },
    // One line under the name in the footer, per language.
    tagline: {
      en: 'A family Gasthaus in Vienna, with Viennese cooking and a garden.',
      de: 'Ein Gasthaus in Familienhand in Wien, mit Wiener Küche und Gastgarten.',
      it: 'Un Gasthaus di famiglia a Vienna, con cucina viennese e giardino.',
    },
    // The schema.org type of the home page's organisation. This home page replaces it with `Restaurant` (a kind of
    // LocalBusiness, with opening hours and the menu: restaurantJsonLd in app/pages/index.vue); remove that, and this applies.
    organization: 'LocalBusiness',
    // At most 6. A page of ginko.config.ts `pages` with its label per language (the page's title), or an entry of
    // content/pages/ by id (`pages/<file name without number>`).
    nav: [
      { page: 'menu', label: { en: 'Menu', de: 'Speisekarte', it: 'Menù' } },
      { page: 'lunch', label: { en: 'Lunch', de: 'Mittagsmenü', it: 'Pranzo' } },
      { page: 'events', label: { en: 'Events', de: 'Veranstaltungen', it: 'Eventi' } },
      { entry: 'pages/about' },
      { page: 'reservations', label: { en: 'Reservations', de: 'Reservierung', it: 'Prenotazioni' } },
    ],
    footer: [{ page: 'gallery', label: { en: 'Gallery', de: 'Galerie', it: 'Galleria' } }],
    // For example { label: 'Instagram', url: 'https://www.instagram.com/…' }.
    socials: [],
  } satisfies SiteAppConfig,
})
