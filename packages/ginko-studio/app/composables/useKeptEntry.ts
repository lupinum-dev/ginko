// The entry a form edits, kept after it leaves the live list: when someone else removes it, the form
// stays with the person's input and says so (EntryGoneBanner) instead of unmounting.
import type { Entry } from './useSiteData'

/** `id`: the entry wanted now; a kept entry counts only while it is still the one wanted. */
export function useKeptEntry(id: () => string | undefined, live: () => Entry | undefined) {
  const kept = shallowRef<Entry>()
  watch(live, (e) => { if (e) kept.value = e }, { immediate: true })
  const gone = computed(() => (!live() && id() !== undefined && kept.value?._id === id() ? kept.value : undefined))
  return {
    entry: computed(() => live() ?? gone.value),
    /** Seen live before and gone now. */
    removed: computed(() => !!gone.value),
  }
}
