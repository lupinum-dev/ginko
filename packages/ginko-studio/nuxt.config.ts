import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'

const here = (path: string) => fileURLToPath(new URL(path, import.meta.url))

/**
 * Origins from the env, with the local defaults for development: the platform UI on 3100 (as in apps/platform and
 * the server's `SITE_URL`), the local Convex backend on 3210 (functions) and 3211 (HTTP actions). The Convex URLs
 * are read as the module reads them, the `NUXT_PUBLIC_*` name first. Passing them explicitly gives the module and
 * the /bundle proxy one value, and keeps `nuxt prepare` and typecheck (which load no env) free of URL warnings.
 */
const fromEnv = (...names: string[]) => names.map((name) => process.env[name]).find(Boolean)
const env = {
  site: fromEnv('SITE_URL'),
  convex: fromEnv('NUXT_PUBLIC_CONVEX_URL', 'CONVEX_URL'),
  convexSite: fromEnv('NUXT_PUBLIC_CONVEX_SITE_URL', 'CONVEX_SITE_URL'),
}
const missing = [
  !env.site && 'SITE_URL',
  !env.convex && 'NUXT_PUBLIC_CONVEX_URL (or CONVEX_URL)',
  !env.convexSite && 'NUXT_PUBLIC_CONVEX_SITE_URL (or CONVEX_SITE_URL)',
].filter((name) => name !== false)
const siteUrl = env.site || 'http://localhost:3100'
const convexUrl = env.convex || 'http://127.0.0.1:3210'
const convexSiteUrl = env.convexSite || 'http://127.0.0.1:3211'

export default defineNuxtConfig({
  compatibilityDate: '2026-10-01',
  modules: [
    // A production build stops when an origin is missing: with the local default, sign-in and the bundle
    // proxy would fail later in confusing ways. `nuxt prepare` (install, typecheck) and dev keep the defaults.
    (_options, nuxt) => {
      if (nuxt.options.dev || nuxt.options._prepare || !missing.length) return
      throw new Error(`${missing.join(', ')} ${missing.length > 1 ? 'are' : 'is'} not set. A production build of the Studio needs ${missing.length > 1 ? 'them' : 'it'} (see the ginko-studio README).`)
    },
    '@lupinum/ginko-i18n', '@lupinum/better-convex-nuxt', 'shadcn-nuxt',
  ],
  // The whole Studio is one user-locale zone: no URL prefix; the person's language comes from the `ginko_locale`
  // cookie, then Accept-Language, then English. The account setting overrides it (useAccountLocale).
  i18n: { locales: ['en', 'de', 'es'], defaultLocale: 'en', userLocale: ['/**'], baseUrl: siteUrl },
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
    '/bundle/**': { proxy: `${convexSiteUrl}/bundle/**` },
  },
  // Sign-in for people in the platform (SPEC 10). Origin and trusted IP header come from the env (see docs: Better Auth setup).
  convex: {
    url: convexUrl,
    siteUrl: convexSiteUrl,
    auth: {
      origin: siteUrl,
      trustedClientIpHeader: process.env.BCN_AUTH_TRUSTED_CLIENT_IP_HEADER,
      // The module looks for app/convex-auth.ts in the host app; it lives in this layer.
      client: here('./app/convex-auth.ts'),
      redirectTo: '/login',
      // Every page needs a signed-in person; only /login opts out (`convexAuth: 'guest'`).
      routes: 'protected',
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
