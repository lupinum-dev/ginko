// Allowed upload types (SPEC 4.3): the core table gives type and limit; here are the first bytes
// that prove the content, so a file cannot pass as another kind by its declared type alone.
import { formatMb, limitOf, UPLOAD_TYPES, type UploadType } from '@lupinum/ginko/internal'

const at = (bytes: Uint8Array, offset: number, text: string) => [...text].every((c, i) => bytes[offset + i] === c.charCodeAt(0))

const SIGNATURES: Record<UploadType, (bytes: Uint8Array) => boolean> = {
  'image/jpeg': (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  'image/png': (b) => b[0] === 0x89 && at(b, 1, 'PNG'),
  'image/webp': (b) => at(b, 0, 'RIFF') && at(b, 8, 'WEBP'),
  'image/heic': (b) => at(b, 4, 'ftyp'),
  'application/pdf': (b) => at(b, 0, '%PDF-'),
}

/** Why the route refuses a file, as a catalog message (the Studio shows it in the person's language). */
export const TOO_LARGE = { key: 'errors.uploadTooLarge', params: { imageMb: formatMb(limitOf('image')), fileMb: formatMb(limitOf('file')) } } as const
export const WRONG_TYPE = { key: 'errors.uploadWrongType', params: { types: Object.values(UPLOAD_TYPES).map((t) => t.label).join(', ') } } as const
export const WRONG_CONTENT = { key: 'errors.uploadWrongContent' } as const

const NAME_FALLBACK = 'datei'
const NAME_MAX = 120

/**
 * The name an upload is stored under. It must be safe to use as a file name later (`ginko pull`,
 * `ginko export`): only the part after the last / or \, no control characters (bidi overrides
 * count, they hide the real extension), NFC, at most 120 characters with the extension kept.
 * A name that ends up empty, or only dots, becomes "datei".
 */
export function cleanName(raw: string): string {
  const base = raw.normalize('NFC').split(/[\\/]/).pop()!
  const name = base.replace(/[\p{Cc}\u2028\u2029\u202a-\u202e\u2066-\u2069]/gu, '').trim()
  if (/^\.*$/.test(name)) return NAME_FALLBACK
  if (name.length <= NAME_MAX) return name
  const dot = name.lastIndexOf('.')
  const extension = dot > 0 && name.length - dot <= 20 ? name.slice(dot) : ''
  const head = name.slice(0, NAME_MAX - extension.length)
  // Never end on half of a surrogate pair.
  return (/[\ud800-\udbff]$/.test(head) ? head.slice(0, -1) : head) + extension
}

/** The kind of a declared type, or undefined when it is not allowed. */
export function kindOf(mime: string | undefined) {
  const key = (mime ?? '').split(';')[0]!.trim().toLowerCase()
  if (!Object.hasOwn(UPLOAD_TYPES, key)) return undefined
  const type = key as UploadType
  return { mime: type, limit: UPLOAD_TYPES[type].limit, signature: SIGNATURES[type] }
}
