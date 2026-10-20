// Whether the area list beside the Inhalte pages is folded away. The entry editor folds it while its preview is open
// (design A: form and preview share the panel) and makes it foldable; the button in the top bar brings it back.
// One state for the whole tab: a new page starts unfolded unless its editor folds it again.

export function useAreaList() {
  const folded = useState('ginko:areas-folded', () => false)
  const foldable = useState('ginko:areas-foldable', () => false)
  return {
    folded,
    foldable,
    toggle: () => { folded.value = !folded.value },
    /** The editor's side: while `on`, the list is foldable and folded; off restores both. */
    foldFor: (on: boolean) => { foldable.value = on; folded.value = on },
  }
}
