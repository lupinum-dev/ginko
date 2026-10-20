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
  // The families are chosen in main.css (`--font-body`). Noto Sans Arabic sets the Arabic pages; `global` also gives
  // it to the share cards (nuxt-og-image reads fonts from @nuxt/fonts only), so an Arabic title is not drawn as boxes.
  // `optional`: a slow first visit keeps the system's Arabic font instead of swapping it later, because the two
  // differ in height and the swap would move the page (CLS); the next page has the font from the cache. It is not
  // preloaded: @nuxt/fonts preloads on every page, and Latin pages do not need it.
  // `fallbacks: []`: no size-matched Helvetica or Arial face after it. Those cover every character, so Latin words on
  // Arabic pages (the name, emails, dates) would never reach Inter; without them they do.
  fonts: {
    defaults: { weights: ['400 700'], styles: ['normal'], subsets: ['latin', 'latin-ext'] },
    families: [{ name: 'Noto Sans Arabic', weights: ['400 800'], subsets: ['arabic'], global: true, display: 'optional', fallbacks: [] }],
  },
  shadcn: { prefix: '', componentDir: './app/components/ui' },
  hooks: {
    'build:before': () => checkSiteUrl(ginko.url),
  },
  vite: { plugins: [tailwindcss()] },
})
