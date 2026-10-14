/// <reference path="./schema.d.ts" />
// Loads the bundle of the current locale once per request (SPEC 8 "Ein Bundle-Anbieter"),
// and on client navigation into another locale. The preview fills the state by message instead,
// and in preview mode nothing fetches. The preview listeners live here, not in preview.vue,
// because the preview page is replaced by the target route after the first bundle.
import { addAlternatesResolver, addRouteMiddleware, clearError, createError, defineNuxtPlugin, useError, useRequestHeader, useRequestURL, useResponseHeader, useRuntimeConfig, useState } from '#imports'
import type { NuxtApp } from '#app'
import type { Ref } from 'vue'
import schema from '#ginko/schema'
import { bundleFits, isBundle, knownBricks, platformMarkdownRef, withFileBricks, withMarkdownRefs, type Bundle, type Locale } from '../../internal.ts'
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
  if (import.meta.client && PREVIEW.test(path)) listenToPlatform(nuxtApp, config, bundles, preview)
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
    if (!PREVIEW.test(to.path) && !preview.value && !errorPage()) await load(localeOfPath(to.path))
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

/**
 * Preview messages (SPEC 8 "Vorschau"). Only the platform's frame (source and origin) may send a bundle
 * for the session and locale the preview page announced. Links are cancelled and reported to the platform.
 */
function listenToPlatform(
  nuxtApp: NuxtApp,
  config: GinkoPublicConfig,
  bundles: Ref<Partial<Record<Locale, Bundle>>>,
  preview: Ref<{ session: string; locale: Locale } | null>,
) {
  const origin = config.platform ? new URL(config.platform).origin : ''
  window.addEventListener('message', (event) => {
    const state = preview.value
    if (!state || !origin || event.source !== window.parent || event.origin !== origin) return
    const data: unknown = event.data
    if (typeof data !== 'object' || data === null) return
    const message = data as Record<string, unknown>
    if (message.type !== 'ginko:preview' || message.session !== state.session || message.site !== config.site || message.locale !== state.locale || !isBundle(message.bundle) || !bundleFits(message.bundle, schema)) return
    const platform = knownBricks(message.bundle, schema)
    const locale = state.locale
    // The platform sends only its own bricks; file bricks come from the site, as in `loadBundle`.
    // If the site's file route fails, the preview still shows the platform's bricks.
    void filesOf(locale).then((files) => {
      if (preview.value?.session !== state.session) return
      bundles.value = { ...bundles.value, [locale]: withFileBricks(platform, files, schema) }
      // A draft without the entry at this address showed the 404 page. The Studio sends every draft into the same
      // frame, and only a navigation clears a fatal error, so each new draft clears it and the page renders again.
      void nuxtApp.runWithContext(() => (useError().value ? clearError() : undefined))
    })
  })
  const fileBundles: Partial<Record<Locale, Promise<Bundle | undefined>>> = {}
  const filesOf = (locale: Locale) => (fileBundles[locale] ??= config.sources.files ? $fetch<Bundle>(`/__ginko/files/${locale}.json`).catch(() => undefined) : Promise.resolve(undefined))
  // Middle click (button 1) opens a link in a new tab, so it is intercepted like a plain click.
  const interceptLink = (event: MouseEvent) => {
    const state = preview.value
    if (!state || (event.type === 'auxclick' && event.button !== 1) || !(event.target instanceof Element)) return
    const link = event.target.closest('a[href]')
    if (!link) return
    event.preventDefault()
    const url = new URL(link.getAttribute('href') ?? '', location.href)
    if (origin && url.origin === location.origin) window.parent.postMessage({ type: 'ginko:navigate', session: state.session, path: url.pathname + url.search + url.hash }, origin)
  }
  document.addEventListener('click', interceptLink, true)
  document.addEventListener('auxclick', interceptLink, true)
}
