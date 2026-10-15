// The preview's listener (SPEC 8 "Vorschau"). The preview page (preview.vue) starts it, so no other page carries its
// code. It listens on the window, not in the page's lifetime: the preview page is replaced by the target route after
// the first bundle, and the listener keeps working there.
import { clearError, useError } from '#imports'
import type { NuxtApp } from '#app'
import type { Ref } from 'vue'
import schema from '#ginko/schema'
import { bundleFits, isBundle, knownBricks, withFileBricks, type Bundle, type Locale } from '../../internal.ts'
import type { GinkoPublicConfig } from './shared.ts'

let listening = false

/**
 * Preview messages (SPEC 8 "Vorschau"). Only the platform's frame (source and origin) may send a bundle
 * for the session and locale the preview page announced. Links are cancelled and reported to the platform.
 * Once per page load: a second call does nothing.
 */
export function listenToPlatform(
  nuxtApp: NuxtApp,
  config: GinkoPublicConfig,
  bundles: Ref<Partial<Record<Locale, Bundle>>>,
  preview: Ref<{ session: string; locale: Locale } | null>,
) {
  if (listening) return
  listening = true
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
