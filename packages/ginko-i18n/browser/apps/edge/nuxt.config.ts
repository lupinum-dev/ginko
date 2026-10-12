// Edge cases: a sub-path deploy, 4 locales (one partial, one right-to-left), sitemap, a server island,
// and a cache rule that the module must warn about.
export default defineNuxtConfig({
  extends: ['../../fixtures/site'],
  modules: ['@nuxtjs/sitemap'],
  app: { baseURL: '/sub/' },
  site: { url: 'https://example.test' },
  routeRules: { '/api/**': { swr: 60 } },
  experimental: { componentIslands: true },
  i18n: {
    // Repeats the layer's two locales on purpose: layers concatenate arrays.
    locales: ['de-AT', 'en-GB', 'it-IT', 'ar'],
  },
})
