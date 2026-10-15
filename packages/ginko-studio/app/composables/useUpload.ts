// Sends one file the way SPEC 4.3 describes: a one-time ticket from uploads.prepare, then the file
// with that ticket to the Convex route POST /upload, which stores and registers it for this member
// and site. No session token reaches the page, and no file passes through the Nuxt server (whose host
// limits request size). Returns a function that resolves with the upload id.
import { api } from '#convex/api'
import { useI18n } from '#imports'
import { acceptOf } from '@lupinum/ginko/internal'
import { useTextOf } from './useTextOf'

const MB = 1024 * 1024
const IMAGE_TYPES = acceptOf('image').split(',')
/** An iPhone photo in HEIC: the Files library cannot read it, so it is refused before it is sent. */
const HEIC = /\.hei[cf]$|^image\/hei[cf]/i

/** A refused or failed upload; its message is already the text to show, in the Studio's language. */
export class UploadError extends Error {
  override name = 'UploadError'
}

/** Library uploads are kept (no 7-day sweep) and may go straight into a folder. */
export interface UploadTarget { folder?: string; library?: boolean }

export function useUpload(kind: 'image' | 'file' = 'image') {
  const { mutate: prepare } = useConvexMutation(api.uploads.prepare)
  const { siteUrl } = useConvexConfig()
  const { t } = useI18n()
  const textOf = useTextOf()

  /** Throws an UploadError whose message is the text to show in the Studio's language; after `signal` aborts, an AbortError. */
  return async function send(site: string, file: File, signal?: AbortSignal, target: UploadTarget = {}): Promise<string> {
    if (kind === 'image' && (HEIC.test(file.name) || HEIC.test(file.type))) {
      throw new UploadError(textOf({ key: 'errors.uploadHeicUnreadable' }, t('ops.upload.notImage')))
    }
    if (kind === 'image' ? !IMAGE_TYPES.includes(file.type) : file.type !== 'application/pdf') {
      throw new UploadError(kind === 'image' ? t('ops.upload.notImage') : t('ops.upload.notPdf'))
    }
    if (file.size > (kind === 'image' ? 20 : 10) * MB) {
      throw new UploadError(kind === 'image' ? t('ops.upload.photoTooLarge') : t('ops.upload.fileTooLarge'))
    }
    if (!siteUrl) throw new UploadError(t('ops.upload.failed'))
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
    if (!response) throw new UploadError(t('ops.upload.offline'))
    const body = (await response.json().catch(() => null)) as { upload?: unknown; key?: unknown; params?: Record<string, unknown> } | null
    // The route names its reason as a catalog key; anything else gets the generic sentence.
    if (!response.ok || typeof body?.upload !== 'string') throw new UploadError(textOf(typeof body?.key === 'string' ? { key: body.key, params: body.params } : null, t('ops.upload.failed')))
    return body.upload
  }
}
