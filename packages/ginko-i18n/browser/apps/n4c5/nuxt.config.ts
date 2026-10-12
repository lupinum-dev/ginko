// Nuxt 4 with the Nuxt 5 behaviour switched on: the upgrade path most fleet sites take first.
export default defineNuxtConfig({ extends: ['../../fixtures/site'], future: { compatibilityVersion: 5 } })
