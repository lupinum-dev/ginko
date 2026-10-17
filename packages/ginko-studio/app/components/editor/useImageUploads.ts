// Pictures that are pasted or dropped into a Markdown field: refused when they are too big or the wrong type, otherwise
// uploaded into the library with the same flow as the photo field (`useUpload`). The editor shows "wird hochgeladen …"
// at the place meanwhile; when the server has the picture ready, the place becomes the image with its library reference
// (`$file.<id>`, the editor shows the file), and `describe` asks for the description (a picture needs one).
import { computed, inject, ref, watch } from 'vue'
import { useI18n } from '#imports'
import { formatMb, limitOf, UPLOAD_TYPES } from '@lupinum/ginko/internal'
import { cancelUpload, finishUpload, GINKO_ASSETS, startUpload, useUpload } from '@lupinum/ginko-editor'
import type { Editor } from '@tiptap/core'

const READY_TIMEOUT_MS = 90_000

const imageTypes = Object.entries(UPLOAD_TYPES).filter(([, type]) => type.kind === 'image')

/** Why `file` is not uploaded, before anything is sent; undefined when it may go. `t` is the Studio translator. */
export function refuseImage(file: { type: string; size: number }, t: (key: 'editor.upload.badType' | 'editor.upload.tooBig', params: { types: string } | { max: string | number }) => string): string | undefined {
  if (!imageTypes.some(([mime]) => mime === file.type)) return t('editor.upload.badType', { types: imageTypes.map(([, type]) => type.label).join(', ') })
  if (file.size > limitOf('image')) return t('editor.upload.tooBig', { max: formatMb(limitOf('image')) })
  return undefined
}

export interface ImageUploadOptions {
  /** The id of the field: the key under which a running upload blocks the save. */
  id: () => string
  editor: () => Editor | undefined
  /** A picture is in the text and waits for its description (position of the image). */
  describe: (pos: number) => void
  /** Shows why a picture did not make it. */
  fail: (message: string) => void
}

/**
 * Returns `handle(files, pos)` for the paste and drop hook of the core: true when the files are taken (also when they
 * are refused with a message), false when this field cannot take pictures (no upload adapter, no image in the profile).
 */
export function useImageUploads(o: ImageUploadOptions) {
  const { t } = useI18n()
  const generic = () => t('editor.upload.generic')
  const assets = inject(GINKO_ASSETS, undefined)
  if (!assets) return { handle: () => false }

  /** The upload the server is processing now; one at a time, so the live state of one id is enough. */
  const current = ref<string>()
  const working = ref(false)
  const state = assets.state(current)
  const details = assets.details(computed(() => (current.value ? [current.value] : [])))
  const { choose, error } = useUpload({
    kind: 'image',
    id: () => `${o.id()}-images`,
    generic: generic(),
    blockedText: t('editor.upload.wait'),
    processing: working,
    precheck: (file) => refuseImage(file, t),
  })

  /** Waits until the server has processed the upload, so the picture shows at once. */
  function ready(id: string): Promise<void> {
    current.value = id
    return new Promise((resolve, reject) => {
      let stop = () => {}
      let settled = false
      const done = (settle: () => void) => { settled = true; clearTimeout(timer); stop(); settle() }
      const timer = setTimeout(() => done(() => reject(new Error(t('editor.upload.notReady')))), READY_TIMEOUT_MS)
      stop = watch([state, details], () => {
        if (state.value?.status === 'failed') { const message = state.value.error ?? generic(); done(() => reject(new Error(message))); return }
        if (details.value?.[id]?.url) done(resolve)
      }, { immediate: true })
      // Settled during the first look: the watcher did not exist yet to be stopped.
      if (settled) stop()
    })
  }

  async function run(file: File, slot: string, editor: Editor) {
    try {
      let uploaded: string | undefined
      await choose(file, (id) => { uploaded = id })
      if (!uploaded) { cancelUpload(editor, slot); o.fail(error.value ?? generic()); return }
      await ready(uploaded)
      if (editor.isDestroyed) { o.fail(t('editor.upload.reopened')); return }
      const at = finishUpload(editor, slot, { src: `$file.${uploaded}`, alt: '' })
      if (at !== undefined) o.describe(at)
    } catch (failure) {
      cancelUpload(editor, slot)
      o.fail(failure instanceof Error ? failure.message : generic())
    } finally {
      current.value = undefined
    }
  }

  let queue: Promise<void> = Promise.resolve()
  let waiting = 0
  let counter = 0

  /** With `replace`, `pos` is a picture the first file replaces once it is ready ("Bild ersetzen"); until then it stays. */
  function handle(files: File[], pos: number, replace = false): boolean {
    const editor = o.editor()
    if (!editor || !editor.schema.nodes.image) return false
    for (const [i, file] of files.entries()) {
      const refusal = refuseImage(file, t)
      if (refusal) { o.fail(refusal); continue }
      const slot = `upload-${++counter}`
      if (!startUpload(editor, slot, pos, t('editor.upload.uploading'), replace && i === 0)) continue
      waiting++
      working.value = true
      queue = queue.then(() => run(file, slot, editor)).finally(() => { if (--waiting === 0) working.value = false })
    }
    return true
  }

  return { handle }
}
