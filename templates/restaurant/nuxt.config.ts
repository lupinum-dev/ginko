import tailwindcss from '@tailwindcss/vite'
import type { NuxtPage } from 'nuxt/schema'
import ginko from './ginko.config.ts'
import { locales, translatedPath } from './app/routes.ts'
import { checkSiteUrl } from './site-url.ts'

/** Gives each page file its translated address per language (`slugs` in app/routes.ts), as
 *  `definePageMeta({ i18n: { paths } })` would: the files in app/pages/ come from shared features and stay unchanged. */
function translatePages(pages: NuxtPage[]) {
  for (const page of pages) {
    const paths = Object.fromEntries(locales.flatMap((locale) => {
      const path = translatedPath(page.path, locale)
      return path === page.path ? [] : [[locale, path]]
    }))
    if (Object.keys(paths).length) page.meta = { ...page.meta, i18n: { paths } }
    if (page.children) translatePages(page.children)
  }
}

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
  css: ['~/assets/css/main.css'],
  // Light and dark follow the visitor's system until they pick one with the toggle; `.dark` on <html>.
  colorMode: { classSuffix: '', preference: 'system', fallback: 'light', storageKey: 'color-mode' },
  // Fonts are downloaded at build time and served from the site itself: no request to Google from the visitor.
  // The families are chosen in main.css (`--font-body`, `--font-heading`).
  fonts: { defaults: { weights: ['400 700'], styles: ['normal'], subsets: ['latin', 'latin-ext'] } },
  shadcn: { prefix: '', componentDir: './app/components/ui' },
  hooks: {
    'build:before': () => checkSiteUrl(ginko.url),
    'pages:extend': translatePages,
  },
  vite: { plugins: [tailwindcss()] },
})
