// A small disclosure popover (language menu, page actions, phone table of contents): a button toggles a panel;
// a click outside, Escape or a page change closes it, and Escape returns focus to the button.
// The component puts `ref="popover"` on the element that holds both the button and the panel, and binds `toggle`
// to the button's click (Escape returns focus to that button).
export function useDocsPopover() {
  const open = ref(false)
  const root = useTemplateRef<HTMLElement>('popover')
  const route = useRoute()
  let trigger: HTMLElement | undefined

  function close(refocus = false) {
    if (!open.value) return
    open.value = false
    if (refocus) (trigger ?? root.value?.querySelector<HTMLElement>('[aria-expanded]'))?.focus()
  }
  const onClick = (e: MouseEvent) => { if (!root.value?.contains(e.target as Node)) close() }
  const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(true) }
  function listen(on: boolean) {
    if (on) {
      document.addEventListener('click', onClick, true)
      document.addEventListener('keydown', onKey)
    } else {
      document.removeEventListener('click', onClick, true)
      document.removeEventListener('keydown', onKey)
    }
  }

  watch(open, (value) => listen(value))
  watch(() => route.fullPath, () => close())
  onBeforeUnmount(() => listen(false))
  function toggle(event?: Event) {
    if (event?.currentTarget instanceof HTMLElement) trigger = event.currentTarget
    open.value = !open.value
  }
  return { open, toggle, close }
}
