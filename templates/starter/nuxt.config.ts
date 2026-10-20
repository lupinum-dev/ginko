import tailwindcss from '@tailwindcss/vite'
import ginko from './ginko.config.ts'
import { checkSiteUrl } from './site-url.ts'

export default defineNuxtConfig({
  compatibilityDate: '2026-10-01',
  modules: [
    '@lupinum/ginko/nuxt',
    '@nuxt/eslint',
    '@nuxt/fonts',
    '@nuxtjs/color-mode',
    'nuxt-og-image',
    'shadcn-nuxt',
  ],
  ginko,
  // The site's icon: the initial on the brand colour. Replace public/favicon.svg with the real mark.
  app: { head: { link: [{ rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' }] } },
  css: ['~/assets/css/main.css'],
  // Light and dark follow the visitor's system until they pick one with the toggle; `.dark` on <html>.
  colorMode: { classSuffix: '', preference: 'system', fallback: 'light', storageKey: 'color-mode' },
  // Fonts are downloaded at build time and served from the site itself: no request to Google from the visitor.
  // The families are chosen in main.css (`--font-body`, `--font-heading`).
  fonts: { defaults: { weights: ['400 700'], styles: ['normal'], subsets: ['latin', 'latin-ext'] } },
  shadcn: { prefix: '', componentDir: './app/components/ui' },
  hooks: {
    'build:before': () => checkSiteUrl(ginko.url),
  },
  vite: { plugins: [tailwindcss()] },
})
