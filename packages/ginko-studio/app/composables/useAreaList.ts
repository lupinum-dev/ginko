// Whether the area list beside the Inhalte pages is folded away. The entry editor folds it while its preview is open
// (design A: form and preview share the panel) and makes it foldable; the button in the top bar brings it back.
// One state per tab, set only in the browser: on the server it stays unfolded (the editor folds after mount), so a
// module-level ref shares nothing between requests that matters.
import { ref } from 'vue'

const folded = ref(false)
const foldable = ref(false)

export function useAreaList() {
  return {
    folded,
    foldable,
    toggle: () => { folded.value = !folded.value },
    /** The editor's side: while `on`, the list is foldable and folded; off restores both. */
    foldFor: (on: boolean) => { foldable.value = on; folded.value = on },
  }
}
