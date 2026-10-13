// Copies text and shows the result for two seconds: `copied`, or `failed` when the clipboard is blocked.
export function useDocsCopy() {
  const state = ref<'idle' | 'copied' | 'failed'>('idle')
  let timer: ReturnType<typeof setTimeout> | undefined
  async function copy(text: string | (() => Promise<string>)) {
    try {
      await navigator.clipboard.writeText(typeof text === 'string' ? text : await text())
      state.value = 'copied'
    } catch {
      state.value = 'failed'
    }
    clearTimeout(timer)
    timer = setTimeout(() => { state.value = 'idle' }, 2000)
  }
  onBeforeUnmount(() => clearTimeout(timer))
  return { state, copy }
}
