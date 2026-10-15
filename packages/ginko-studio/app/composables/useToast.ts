// One message at a time at the bottom of the screen, optionally with one action (Rückgängig).
// A new message replaces the old one. It stays 8 s, and while it has focus or the pointer (sonner pauses on both).
// <AppToast /> (in app.vue) renders it; this composable is the only call site API for the rest of the app.
import { toast } from 'vue-sonner'

export interface ToastAction { label: string; run: () => Promise<void> | void }
export interface Toast { text: string; tone: 'ok' | 'err'; action?: ToastAction }

const TOAST_ID = 'ginko-toast'
const DURATION = 8000

export function useToast() {
  const show = (text: string, options: { tone?: Toast['tone']; action?: ToastAction } = {}) => {
    // No text, no message: a call the person's own action stopped (OpError CANCELLED) has nothing to say.
    if (!text) return
    const { action } = options
    let running = false
    const send = options.tone === 'err' ? toast.error : toast.success
    send(text, {
      id: TOAST_ID,
      duration: DURATION,
      action: action && {
        label: action.label,
        onClick: async (event: MouseEvent) => {
          // Stay open while the action runs; the action usually replaces this message with its own result.
          event.preventDefault()
          if (running) return
          running = true
          try { await action.run() } finally { running = false }
        },
      },
    })
  }
  const clear = () => { toast.dismiss(TOAST_ID) }
  return { show, clear }
}
