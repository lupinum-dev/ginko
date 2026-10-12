// Module Builder prepares a minimal Nuxt environment for runtime declarations. ginko-i18n is in it because the
// module requires it (sites get it through `@lupinum/ginko/nuxt`), and it types `useI18n` in the plugin.
export default defineNuxtConfig({ modules: ['@lupinum/ginko-i18n'], i18n: { locales: ['en'], seo: false } })
