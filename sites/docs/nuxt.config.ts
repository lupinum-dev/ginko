import ginko from './ginko.config'

export default defineNuxtConfig({
  compatibilityDate: '2026-10-01',
  extends: ['@lupinum/ginko-docs'],
  // nuxt-og-image first: the Ginko module looks for it when it sets up (generated share cards).
  modules: ['nuxt-og-image', '@lupinum/ginko/nuxt'],
  ginko,
  app: { head: { link: [{ rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' }] } },
})
