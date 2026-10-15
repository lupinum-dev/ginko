/** A shortcut with Cmd (Apple) or Ctrl and one letter, without Alt or Shift: Cmd+K, Cmd+F, Cmd+S. */
export const isModKey = (event: KeyboardEvent, key: string) =>
  (event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === key
