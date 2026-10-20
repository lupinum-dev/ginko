// The top bar of the framed panel on wide screens (design A): the site name, then the open page's crumbs, then the
// page's own actions. A page names its crumbs with `useCrumbs`; without it the bar shows the view's nav word (D26).
// Actions (Save, Preview) go in with `<Teleport to="#studio-actions">` once mounted: the target exists only on wide
// screens, so `usePanelBar()` says whether to teleport. Phones keep their bars (the editor's save bar at the bottom).
import { computed, inject, onBeforeUnmount, onMounted, provide, ref, shallowRef, type InjectionKey, type ShallowRef } from 'vue'

export interface Crumb { label: string; to?: string }
interface CrumbSlot { owner: symbol; crumbs: () => Crumb[] }

const CRUMBS: InjectionKey<ShallowRef<CrumbSlot | undefined>> = Symbol('studio:crumbs')

/** The layout's side: returns the crumbs of the page that registered last. */
export function provideCrumbs() {
  const slot = shallowRef<CrumbSlot>()
  provide(CRUMBS, slot)
  return computed<Crumb[] | undefined>(() => slot.value?.crumbs())
}

/** A page's crumbs after the site name. The last one is the page itself (no link). */
export function useCrumbs(crumbs: () => Crumb[]) {
  const slot = inject(CRUMBS, undefined)
  if (!slot) return
  // The next page registers before the old one unmounts: only clear what is still our own.
  const owner = Symbol('crumbs')
  slot.value = { owner, crumbs }
  onBeforeUnmount(() => { if (slot.value?.owner === owner) slot.value = undefined })
}

/** The width from which the panel top bar exists (the layout's `min-[900px]` breakpoint). */
export const PANEL_QUERY = '(min-width: 900px)'

/**
 * True once mounted on a screen with the panel top bar, so `<Teleport to="#studio-actions" :disabled="!bar">` moves a
 * page's actions up there and leaves them in place on phones, on the server and in tests (no matchMedia match).
 */
export function usePanelBar() {
  const bar = ref(false)
  onMounted(() => {
    const query = window.matchMedia?.(PANEL_QUERY)
    if (!query) return
    const sync = () => { bar.value = query.matches && !!document.getElementById('studio-actions') }
    sync()
    query.addEventListener?.('change', sync)
    onBeforeUnmount(() => query.removeEventListener?.('change', sync))
  })
  return bar
}
