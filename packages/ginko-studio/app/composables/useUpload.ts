// Sends one file the way SPEC 4.3 describes: a one-time ticket from uploads.prepare, then the file
// with that ticket to the Convex route POST /upload, which stores and registers it for this member
// and site. No session token reaches the page, and no file passes through the Nuxt server (whose host
// limits request size). Returns a function that resolves with the upload id.
import { api } from '#convex/api'
import { useI18n } from '#imports'

const MB = 1024 * 1024
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic']

/** Library uploads are kept (no 7-day sweep) and may go straight into a folder. */
export interface UploadTarget { folder?: string; library?: boolean }

export function useUpload(kind: 'image' | 'file' = 'image') {
  const { mutate: prepare } = useConvexMutation(api.uploads.prepare)
  const { siteUrl } = useConvexConfig()
  const { t } = useI18n()

  /** Throws an Error whose message is the text to show in the Studio's language; after `signal` aborts, an AbortError. */
  return async function send(site: string, file: File, signal?: AbortSignal, target: UploadTarget = {}): Promise<string> {
    if (kind === 'image' ? !IMAGE_TYPES.includes(file.type) : file.type !== 'application/pdf') {
      throw new Error(kind === 'image' ? t('ops.upload.notImage') : t('ops.upload.notPdf'))
    }
    if (file.size > (kind === 'image' ? 20 : 10) * MB) {
      throw new Error(kind === 'image' ? t('ops.upload.photoTooLarge') : t('ops.upload.fileTooLarge'))
    }
    if (!siteUrl) throw new Error(t('ops.upload.failed'))
    // Cancelling must also work while the ticket is on its way (offline): a late ticket is ignored (Astra 9).
    const aborted = new Promise<never>((_, reject) => {
      if (signal?.aborted) reject(new DOMException(t('ops.upload.aborted'), 'AbortError'))
      signal?.addEventListener('abort', () => reject(new DOMException(t('ops.upload.aborted'), 'AbortError')), { once: true })
    })
    aborted.catch(() => undefined) // an abort after the ticket arrived is handled by the fetch below
    const { ticket } = await Promise.race([prepare({ site, ...target }), aborted])
    const query = new URLSearchParams({ ticket, name: file.name })
    const response = await fetch(`${siteUrl}/upload?${query}`, { method: 'POST', headers: { 'Content-Type': file.type }, body: file, signal }).catch((error: unknown) => {
      if (signal?.aborted) throw error
      return null
    })
    if (!response) throw new Error(t('ops.upload.offline'))
    const body = (await response.json().catch(() => null)) as { upload?: unknown; message?: unknown } | null
    if (!response.ok || typeof body?.upload !== 'string') throw new Error(typeof body?.message === 'string' ? body.message : t('ops.upload.failed'))
    return body.upload
  }
}
