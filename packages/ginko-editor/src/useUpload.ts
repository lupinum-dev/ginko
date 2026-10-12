import { computed, inject, onBeforeUnmount, ref, watchEffect, type Ref } from 'vue'
import { useGinkoAssets } from './assets.ts'
import { BLOCKERS } from './issues.ts'

export interface UploadOptions {
  kind: 'image' | 'file'
  /** Field id; the key under which a running upload blocks the save. */
  id: () => string
  /** Message when the failure carries none. */
  generic: string
  /** Note shown while the upload or the server check runs. */
  blockedText: string
  /** True while the server checks the stored upload. */
  processing: Ref<boolean>
  /** Returns a message to refuse a file before any upload. */
  precheck?: (file: File) => string | undefined
}

/** The upload flow both file and photo fields share: picker, cancel, error, retry and save blocking. */
export function useUpload(options: UploadOptions) {
  const assets = useGinkoAssets()
  const picker = ref<HTMLInputElement | null>(null)
  const sending = ref(false)
  const error = ref<string | null>(null)
  /** The file of the last choice, to send again on "Erneut versuchen". */
  const retryFile = ref<File | null>(null)

  /** Stops the upload that is on its way; undefined while none is. */
  let cancelUpload: (() => void) | undefined
  let lastUploaded: ((id: string) => void) | undefined
  const cancel = () => cancelUpload?.()
  onBeforeUnmount(cancel)

  async function choose(file: File, onUploaded: (id: string) => void) {
    error.value = null
    retryFile.value = null
    const refused = options.precheck?.(file)
    if (refused) {
      error.value = refused
      return
    }
    retryFile.value = file
    lastUploaded = onUploaded
    sending.value = true
    const controller = new AbortController()
    cancelUpload = () => controller.abort()
    try {
      const id = await assets.upload(options.kind, file, controller.signal)
      // Cancelled on purpose: the field keeps what it had, no error (break-it 9).
      if (!controller.signal.aborted) onUploaded(id)
    } catch (failure) {
      if (!controller.signal.aborted) error.value = failure instanceof Error ? failure.message : options.generic
    } finally {
      sending.value = false
      cancelUpload = undefined
    }
  }

  function pick() {
    picker.value?.click()
  }

  function onPicked(event: Event, onUploaded: (id: string) => void) {
    const input = event.target as HTMLInputElement
    const file = input.files?.[0]
    input.value = ''
    if (file) void choose(file, onUploaded)
  }

  function retry() {
    if (retryFile.value && lastUploaded) void choose(retryFile.value, lastUploaded)
    else pick()
  }

  // A save before the server has the file ready would be refused: block it with a clear note.
  const blockers = inject(BLOCKERS, undefined)
  const busy = computed(() => sending.value || options.processing.value)
  watchEffect(() => {
    if (!blockers) return
    if (busy.value) blockers.set(options.id(), options.blockedText)
    else blockers.delete(options.id())
  })
  onBeforeUnmount(() => blockers?.delete(options.id()))

  return { picker, sending, error, retryFile, cancel, pick, onPicked, retry, choose }
}
