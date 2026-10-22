// The top bar of the framed panel on wide screens (design A): the site name, then the open page's crumbs, then the
// page's own actions. A page names its crumbs with `useCrumbs`; without it the bar shows the view's nav word (D26).
// Actions (Save, Preview) go in with `<Teleport to="#studio-actions">`: the target exists only on wide screens while
// the layout shows its bar, so `usePanelBar()` says whether to teleport. Phones keep their bars (the editor's save bar).
import { computed, inject, onBeforeUnmount, onMounted, provide, ref, shallowRef, type InjectionKey, type Ref, type ShallowRef } from 'vue'

export interface Crumb { label: string; to?: string }
interface CrumbSlot { owner: symbol; crumbs: () => Crumb[] }

const CRUMBS: InjectionKey<ShallowRef<CrumbSlot | undefined>> = Symbol('studio:crumbs')
const PANEL_BAR: InjectionKey<Readonly<Ref<boolean>>> = Symbol('studio:panel-bar')

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
 * The layout's side: true while the panel top bar is on screen, that is on a wide screen once mounted (false on the
 * server, so hydration matches) and while `shown` (the layout renders the bar). One value for every page, so a page that
 * mounts before the bar appears (a site that loads after it) still moves its actions up when it does.
 */
export function providePanelBar(shown: () => boolean) {
  const wide = ref(false)
  onMounted(() => {
    const query = window.matchMedia?.(PANEL_QUERY)
    if (!query) return
    const sync = () => { wide.value = query.matches }
    sync()
    query.addEventListener?.('change', sync)
    onBeforeUnmount(() => query.removeEventListener?.('change', sync))
  })
  const bar = computed(() => wide.value && shown())
  provide(PANEL_BAR, bar)
  return bar
}

/**
 * Whether a page's actions belong in the panel top bar: `<Teleport to="#studio-actions" :disabled="!bar">` moves them up
 * there and leaves them in place on phones, on the server and outside the site layout (tests).
 */
export function usePanelBar(): Readonly<Ref<boolean>> {
  return inject(PANEL_BAR, () => ref(false), true)
}
