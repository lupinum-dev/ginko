import ginko from './ginko.config.ts'
import { checkSiteUrl } from './site-url.ts'

// The docs come from the layer @lupinum/ginko-docs: header, search, navigation, language menu, light and dark,
// footer, the Markdown components, the start page and the changelog. This project brings the content (content/),
// the texts of its own links (i18n/), the colours (app/assets/css/main.css) and app/app.config.ts.
export default defineNuxtConfig({
  compatibilityDate: '2026-10-01',
  extends: ['@lupinum/ginko-docs'],
  // nuxt-og-image draws a share card for every page (Ginko passes title, section and `seo.color`).
  modules: ['@lupinum/ginko/nuxt', '@nuxt/eslint', 'nuxt-og-image'],
  ginko,
  css: ['~/assets/css/main.css'],
  app: { head: { link: [{ rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' }] } },
  hooks: {
    'build:before': () => checkSiteUrl(ginko.url),
  },
})
