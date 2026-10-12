// Small helpers of the interactive components.
import { getCurrentInstance, nextTick, ref, useId, type ComputedRef, type InjectionKey } from 'vue'

/**
 * The one reading of a boolean prop. comark delivers a bare attribute (`open`) as the string "true" and
 * `open="false"` as "false", under the prop name itself. Props whose default is "on" need `withDefaults`:
 * Vue casts a missing Boolean prop to false.
 */
export function isOn(raw: unknown): boolean {
  return raw === true || raw === 'true' || raw === ''
}

/** Name for the <details> of an accordion's items; undefined when several may be open at once. */
export const ACCORDION_KEY: InjectionKey<ComputedRef<string | undefined>> = Symbol('ginko:accordion')

/**
 * WAI-ARIA tabs: the selected index, ids for tab and panel, click and arrow-key handling (Left/Right wrap around,
 * Home/End jump to the ends). `count` is read when a key is pressed, as the tabs come from a slot.
 */
export function useTabs(count: () => number) {
  const id = useId()
  const active = ref(0)
  const tabId = (i: number) => `${id}-t${i}`
  const panelId = (i: number) => `${id}-p${i}`
  async function select(index: number, focus: boolean) {
    active.value = index
    if (!focus) return
    await nextTick()
    document.getElementById(tabId(index))?.focus()
  }
  function onKeydown(event: KeyboardEvent, index: number) {
    const n = count()
    const next = { ArrowRight: (index + 1) % n, ArrowLeft: (index - 1 + n) % n, Home: 0, End: n - 1 }[event.key]
    if (next === undefined) return
    event.preventDefault()
    select(next, true)
  }
  return { id, active, tabId, panelId, select, onKeydown }
}

export const isExternal = (href: string) => /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(href)

/**
 * Link behaviour for `<a :href>`. A plain anchor works everywhere (also without JS); when the app has a router
 * (Nuxt), a plain left click on a path inside the site navigates client-side instead of reloading the page.
 */
export function useLink() {
  const router = (getCurrentInstance()?.proxy as { $router?: { push: (to: string) => unknown } } | null)?.$router
  return {
    rel: (href: string) => (isExternal(href) && /^(?:https?:)?\/\//i.test(href) ? 'noreferrer noopener' : undefined),
    onClick(event: MouseEvent, href: string) {
      if (!router || isExternal(href) || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
      event.preventDefault()
      router.push(href)
    },
  }
}
