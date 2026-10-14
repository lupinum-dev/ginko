// Shared fixture: apps/n4 (Nuxt 4.6) and apps/n5 (Nuxt 5 nightly) extend this layer.
const strategy = (process.env.GINKO_STRATEGY ?? 'prefix_except_default') as 'prefix' | 'prefix_except_default'

export default defineNuxtConfig({
  modules: ['@lupinum/ginko-i18n'],
  compatibilityDate: '2026-10-01',
  nitro: { prerender: { crawlLinks: true, failOnError: false, routes: [...['/blog', '/blog/hallo-welt', '/blog/nur-hier', '/blog/grüße', '/nur-deutsch'].map(p => strategy === 'prefix' ? `/de${p}` : p), '/studio'] } },
  vite: { define: { __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: 'true' } },
  i18n: {
    locales: ['de-AT', 'en-GB'],
    defaultLocale: 'de',
    strategy,
    baseUrl: 'https://example.test',
    params: { tone: 'sie' },
    exclude: ['/studio'],
    userLocale: ['/app/**'],
  },
})
