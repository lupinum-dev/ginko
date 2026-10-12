import ginko from './ginko.config'

export default defineNuxtConfig({
  compatibilityDate: '2026-10-01',
  modules: ['@lupinum/ginko/nuxt'],
  ginko,
  css: ['~/assets/site.css'],
  app: { head: { meta: [{ name: 'color-scheme', content: 'light dark' }] } },
})
