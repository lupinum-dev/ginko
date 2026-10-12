// Vue wrapper around createGinkoEditor: reactive state, and the editor is destroyed with the scope that made it.
import { computed, getCurrentScope, onScopeDispose, ref, shallowRef, toValue, type MaybeRefOrGetter } from 'vue'
import { createGinkoEditor, type GinkoEditorHandle, type GinkoEditorOptions } from './editor.ts'

export function useGinkoEditor(options: MaybeRefOrGetter<GinkoEditorOptions>) {
  const handle = shallowRef<GinkoEditorHandle>()
  const dirty = ref(false)
  let stop: (() => void) | undefined
  let run = 0 // a newer open() or a destroy() makes an older, slower open() throw its result away
  let ended = false

  const close = () => { stop?.(); stop = undefined; handle.value?.destroy(); handle.value = undefined; dirty.value = false }

  /** (Re)opens the editor with the current options. Call it again when the text of the field changes from outside. */
  async function open() {
    const mine = ++run
    const next = await createGinkoEditor(toValue(options))
    if (mine !== run || ended) { next.destroy(); return }
    close()
    handle.value = next
    stop = next.onChange(() => { dirty.value = next.dirty })
  }

  function destroy() { ended = true; run++; close() }
  if (getCurrentScope()) onScopeDispose(destroy)

  const ready = open()
  return {
    /** Resolves when the first open() is done. */
    ready,
    open,
    destroy,
    handle,
    /** `undefined` until opened. */
    mode: computed(() => handle.value?.mode),
    /** The TipTap editor in rich mode, for `<EditorContent>`. */
    editor: computed(() => handle.value?.editor),
    problems: computed(() => handle.value?.problems ?? []),
    /** `problems` with catalog key and parameters, for `coreMessage(locale, key, params)`. */
    problemMessages: computed(() => handle.value?.problemMessages ?? []),
    dirty,
    /** The Markdown for the field. Before the editor is open, an empty string. */
    markdown: async () => (await handle.value?.markdown()) ?? '',
  }
}
