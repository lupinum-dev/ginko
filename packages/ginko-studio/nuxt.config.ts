import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'

const here = (path: string) => fileURLToPath(new URL(path, import.meta.url))

export default defineNuxtConfig({
  compatibilityDate: '2026-10-01',
  modules: ['@lupinum/ginko-i18n', '@lupinum/better-convex-nuxt', 'shadcn-nuxt'],
  // The whole Studio is one user-locale zone: no URL prefix; the person's language comes from the `ginko_locale`
  // cookie, then Accept-Language, then English. The account setting overrides it (useAccountLocale).
  i18n: { locales: ['en', 'de', 'es'], defaultLocale: 'en', userLocale: ['/**'], baseUrl: process.env.SITE_URL ?? 'http://localhost:3000' },
  // `~` and `@` point at the host app, not at this layer, so the layer has its own alias for imports of its files.
  alias: { '@studio': here('./app') },
  // Absolute paths: the same reason. Tokens and Tailwind first, then the old CSS (it sits in a lower-priority layer).
  css: [here('./app/assets/css/tailwind.css'), here('./app/assets/ui.css')],
  vite: { plugins: [tailwindcss()] },
  // The components are shipped as source (.vue, .ts) and must be compiled with the app.
  build: { transpile: ['@lupinum/ginko-components'] },
  shadcn: { prefix: '', componentDir: here('./app/components/ui') },
  // The editor is behind sign-in and reads live data; nothing here is cached or indexed.
  routeRules: {
    '/**': { headers: { 'x-robots-tag': 'noindex' } },
    // A site needs only the platform origin: the bundle endpoint is proxied to Convex (SPEC 6).
    '/bundle/**': { proxy: `${process.env.CONVEX_SITE_URL}/bundle/**` },
  },
  // Sign-in for people in the platform (SPEC 10). Origin and trusted IP header come from the env (see docs: Better Auth setup).
  convex: {
    auth: {
      origin: process.env.SITE_URL ?? 'http://localhost:3000',
      trustedClientIpHeader: process.env.BCN_AUTH_TRUSTED_CLIENT_IP_HEADER,
      // The module looks for app/convex-auth.ts in the host app; it lives in this layer.
      client: here('./app/convex-auth.ts'),
      redirectTo: '/login',
      defaultQueryAuth: 'required',
    },
  },
  // The Vercel server build left an absolute import of the `convex` package unresolved (/login 500 on
  // the hosted demo, Phase 10); bundling it into the server output fixes that.
  nitro: { externals: { inline: ['convex'] } },
  app: {
    head: {
      title: 'Ginko',
      meta: [{ name: 'theme-color', content: '#ffffff' }],
    },
  },
})
