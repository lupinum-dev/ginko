/// <reference path="./schema.d.ts" />
// Loads the bundle of the current locale once per request (SPEC 8 "Ein Bundle-Anbieter"),
// and on client navigation into another locale. The preview fills the state by message instead,
// and in preview mode nothing fetches (the preview page starts its listener: preview-listener.ts).
import { addAlternatesResolver, addRouteMiddleware, createError, defineNuxtPlugin, navigateTo, useRequestHeader, useRequestURL, useResponseHeader, useRuntimeConfig, useState } from '#imports'
import schema from '#ginko/schema'
import { findRedirect, platformMarkdownRef, withMarkdownRefs, type Bundle, type Locale } from '../../internal.ts'
import { BUNDLE_STATE, PREVIEW_STATE } from './composables.ts'
import { loadBundle as loadBundleCore, PlatformError } from './fetch.ts'
import { serverTrees } from './markdown.ts'
import { localeFromPath } from '@lupinum/ginko-i18n/core'
import { config as i18nConfig } from '#ginko-i18n/config.mjs'
import type { GinkoPublicConfig } from './shared.ts'

/**
 * The app's bundle loader: a platform failure becomes Nuxt's fatal 503 error page (never a 404, see `fetchBundle`).
 * File bundles come from the site's own route; on the server that call stays in-process.
 */
async function loadBundle(config: GinkoPublicConfig, locale: Locale, minRev: string | undefined, siteToken: string | undefined): Promise<Bundle> {
  try {
    return await loadBundleCore(config, locale, minRev, (l) => $fetch<Bundle>(`/__ginko/files/${l}.json`), siteToken)
  } catch (error) {
    if (error instanceof PlatformError) throw createError({ statusCode: error.statusCode, statusMessage: error.message, fatal: true, cause: error.cause })
    throw error
  }
}

/** The locale of a path as ginko-i18n resolves it, for code that runs before the router (no `useI18n()` yet). */
const localeOfPath = (path: string) => (localeFromPath(path, i18nConfig) ?? i18nConfig.defaultLocale) as Locale

const PREVIEW = /^\/__ginko(\/|$)/
// Nuxt renders its error page at this path; the bundle already failed there, do not ask again.
const ERROR_PAGE = /^\/__nuxt_error(\/|$)/

export default defineNuxtPlugin(async (nuxtApp) => {
  const config = useRuntimeConfig().public.ginko as GinkoPublicConfig
  // Private runtime config exists on the server only; the browser never has, nor sends, the token. Read before any await (Nuxt context).
  const siteToken = import.meta.server ? (useRuntimeConfig().ginkoRevalidateToken as string | undefined) : undefined
  const bundles = useState<Partial<Record<Locale, Bundle>>>(BUNDLE_STATE, () => ({}))
  // Forwarded so an urgent refresh never renders an older bundle (SPEC 4.4 step 4); invalid values are ignored.
  const minRev = (import.meta.server ? useRequestHeader('x-ginko-min-rev') : undefined) ?? undefined
  const preview = useState<{ session: string; locale: Locale } | null>(PREVIEW_STATE, () => null)

  const load = async (locale: Locale) => {
    if (bundles.value[locale]) return
    const full = await loadBundle(config, locale, minRev, siteToken)
    // On the server, platform texts become `{ ref }` like file texts, so the payload carries only the texts a page
    // renders (useGinkoMarkdown reads them from this request's trees, no extra request). In the browser (language
    // switch) the bundle keeps its trees: they are in memory already, and <GinkoMarkdown> takes both shapes.
    const rev = `${full.schemaRev}.${full.contentRev}`
    bundles.value = { ...bundles.value, [locale]: import.meta.server && config.sources.platform
      ? withMarkdownRefs(full, schema, serverTrees(nuxtApp), (brick, id, field) => platformMarkdownRef(locale, rev, brick, id, field))
      : full }
  }

  // The requested URL, not useRoute(): plugins run before the router resolves, when the route is still '/'.
  const path = useRequestURL().pathname
  // A server error page (a 503 for a failed bundle) never asks the platform again: not while the server
  // renders it, not in the browser that shows it. A hanging platform would hold it for another deadline.
  // Asked at each use: after clearError() a normal navigation loads again (Astra 9).
  // A 4xx page (not found) is an ordinary page of the site: it loads the bundle of the failed URL's locale, so
  // the site's header and navigation render around the message.
  // Nuxt renders an error page as a second request, /__nuxt_error?url=<failed path>&statusCode=…; there the
  // context's error is only `true`, so status and path come from the query.
  const errorQuery = ERROR_PAGE.test(path) ? useRequestURL().searchParams : undefined
  const pageError = () => (import.meta.server ? nuxtApp.ssrContext?.error : nuxtApp.payload.error) as { statusCode?: unknown } | boolean | null | undefined
  const errorPage = () => {
    const error = pageError()
    const status = Number((typeof error === 'object' ? error?.statusCode : undefined) ?? errorQuery?.get('statusCode'))
    return Boolean(error) && !(status < 500)
  }
  const failed = errorQuery?.get('url')
  const pagePath = failed ? new URL(failed, 'http://localhost').pathname : path
  if (!PREVIEW.test(path) && !ERROR_PAGE.test(pagePath) && !errorPage()) {
    const locale = localeOfPath(pagePath)
    await load(locale)
    // Proof for the platform's urgent refresh: which revisions this response was rendered from.
    const bundle = bundles.value[locale]!
    if (import.meta.server) useResponseHeader('x-ginko-rev').value = `${bundle.schemaRev}.${bundle.contentRev}`
  }
  // Detail pages: the entry's URL in every locale where it exists (SPEC 8), for the language switch and hreflang.
  addAlternatesResolver((to) => entryUrls(bundles.value[localeOfPath(to.path)], to.path))
  addRouteMiddleware('ginko-bundle', async (to) => {
    if (PREVIEW.test(to.path) || preview.value || errorPage()) return
    const locale = localeOfPath(to.path)
    await load(locale)
    // An address a platform entry had before its slug changed (`oldUrls`) forwards to its page. Here, not in the server
    // middleware (runtime/server/redirects.ts), which never asks the platform; the bundle is loaded for this page anyway.
    // Only entry rules: the server middleware already applied the site's own.
    if (!config.sources.platform) return
    const hit = findRedirect([], bundles.value[locale], to.path)
    if (hit && hit.to !== to.path) return navigateTo({ path: hit.to, query: to.query, hash: to.hash }, { redirectCode: 301 })
  }, { global: true })
})

/** The URLs of the collection entry at `path`, or undefined when no entry lives there. */
function entryUrls(bundle: Bundle | undefined, path: string): Partial<Record<Locale, string>> | undefined {
  for (const brick of Object.values(bundle?.bricks ?? {})) {
    if (brick.kind !== 'collection') continue
    const item = brick.items.find((i) => i.urls && Object.values(i.urls).includes(path))
    if (item) return item.urls
  }
  return undefined
}
