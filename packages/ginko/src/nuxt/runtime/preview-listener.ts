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
 * for the session and locale the preview page announced, with the field being edited (`focus`: its text, which the
 * page outlines where it shows it, and its label), or `ginko:focus` alone when another field gets the focus.
 * Links are cancelled and reported to the platform.
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
    if (message.type === 'ginko:focus') {
      if (message.session === state.session && message.site === config.site) {
        focus = focusOf(message)
        outline(true)
      }
      return
    }
    if (message.type !== 'ginko:preview' || message.session !== state.session || message.site !== config.site || message.locale !== state.locale || !isBundle(message.bundle) || !bundleFits(message.bundle, schema)) return
    focus = focusOf(message.focus)
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
      // The page renders the new bundle: the outline follows the edited text (without scrolling again).
      setTimeout(() => outline(false), 60)
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
  // The outline follows the page: a new route, images that load, a narrower window.
  nuxtApp.hook('page:finish', () => outline(false))
  new ResizeObserver(() => outline(false)).observe(document.body)
}

/**
 * The field being edited in the Studio: its text and label, and the scale the Studio draws this page at (`zoom`), so
 * the outline and its label keep their size there. Empty text = nothing to outline.
 */
let focus = { text: '', label: '', zoom: 1 }
let shownFor: Element | undefined
let box: HTMLDivElement | undefined

function focusOf(value: unknown) {
  const v = typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {}
  const zoom = typeof v.zoom === 'number' && Number.isFinite(v.zoom) ? Math.min(1, Math.max(0.2, v.zoom)) : 1
  return { text: typeof v.text === 'string' ? v.text : '', label: typeof v.label === 'string' ? v.label : '', zoom }
}

const squash = (text: string) => text.replace(/\s+/g, ' ').trim()

/**
 * Outlines the element that shows the edited text: the deepest element whose text contains it, inside `main` before
 * header and footer (the site name also stands in the header). The outline is a box laid over the page, so the site's
 * own styles and DOM stay untouched. A text shown nowhere (formatted numbers, a field the page does not show) gets
 * no outline. `scroll`: bring it into view when it is a new element.
 */
function outline(scroll: boolean) {
  const needle = squash(focus.text).slice(0, 80)
  const target = needle.length >= 3 ? findText(needle) : undefined
  if (!target) {
    box?.remove()
    box = undefined
    shownFor = undefined
    return
  }
  if (!box) {
    box = document.createElement('div')
    box.setAttribute('aria-hidden', 'true')
    box.dataset.ginkoFocus = ''
    // The Studio's accent colour, on any site.
    Object.assign(box.style, { position: 'absolute', zIndex: '2147483647', pointerEvents: 'none', outlineStyle: 'solid', outlineColor: '#047857', transition: 'top .12s, left .12s, width .12s, height .12s' })
    const tag = document.createElement('span')
    Object.assign(tag.style, { position: 'absolute', bottom: '100%', background: '#047857', color: '#fff', fontFamily: 'system-ui, sans-serif', fontWeight: '600', lineHeight: '1.4', whiteSpace: 'nowrap' })
    box.append(tag)
    document.body.append(box)
  }
  const rect = target.getBoundingClientRect()
  const px = (n: number) => `${n / focus.zoom}px`
  Object.assign(box.style, { top: `${rect.top + window.scrollY}px`, left: `${rect.left + window.scrollX}px`, width: `${rect.width}px`, height: `${rect.height}px`, borderRadius: px(4), outlineWidth: px(2), outlineOffset: px(3) })
  Object.assign((box.firstChild as HTMLSpanElement).style, { left: px(-5), marginBottom: px(5), padding: `${px(1)} ${px(6)}`, borderRadius: px(4), fontSize: px(12) })
  ;(box.firstChild as HTMLSpanElement).textContent = focus.label
  ;(box.firstChild as HTMLSpanElement).style.display = focus.label ? '' : 'none'
  if (scroll && target !== shownFor && (rect.top < 0 || rect.bottom > window.innerHeight)) {
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    target.scrollIntoView({ block: 'center', behavior: still ? 'auto' : 'smooth' })
    setTimeout(() => outline(false), still ? 0 : 400)
  }
  shownFor = target
}

function findText(needle: string): Element | undefined {
  const lower = needle.toLowerCase()
  const holds = (el: Element) => squash(el.textContent ?? '').toLowerCase().includes(lower)
  for (const root of [document.querySelector('main'), document.body]) {
    if (!root || !holds(root)) continue
    let el: Element = root
    // Down to the deepest child that still holds the whole text.
    for (;;) {
      const next = [...el.children].find((child) => !(child instanceof HTMLElement && child.dataset.ginkoFocus !== undefined) && holds(child))
      if (!next) return el
      el = next
    }
  }
  return undefined
}
