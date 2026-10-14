import ginko from './ginko.config.ts'

export default defineNuxtConfig({
  compatibilityDate: '2026-10-01',
  modules: ['@lupinum/ginko/nuxt'],
  ginko,
  css: ['~/assets/site.css'],
  app: {
    head: {
      meta: [{ name: 'theme-color', content: '#fafaf7' }],
      link: [{ rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' }],
    },
  },
})
