import ginko from './ginko.config.ts'

export default defineNuxtConfig({
  compatibilityDate: '2026-10-01',
  // nuxt-og-image draws a share card for every page (Ginko passes title, image, logo and `seo.color`).
  modules: ['@lupinum/ginko/nuxt', 'nuxt-og-image'],
  ginko,
})
