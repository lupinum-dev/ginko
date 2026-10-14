// The upload types Ginko accepts (SPEC 4.3), with their size limits. Server, schema checks and editor
// read this one table; the server adds only the content signatures.
const MB = 1024 * 1024

export const UPLOAD_TYPES = {
  'image/jpeg': { label: 'JPEG', kind: 'image', limit: 20 * MB },
  'image/png': { label: 'PNG', kind: 'image', limit: 20 * MB },
  'image/webp': { label: 'WebP', kind: 'image', limit: 20 * MB },
  'image/heic': { label: 'HEIC', kind: 'image', limit: 20 * MB },
  'application/pdf': { label: 'PDF', kind: 'file', limit: 10 * MB },
} as const satisfies Record<string, { label: string; kind: 'image' | 'file'; limit: number }>

export type UploadType = keyof typeof UPLOAD_TYPES

/** The value of `<input type="file" accept>` for a field kind. */
export function acceptOf(kind: 'image' | 'file'): string {
  return typesOf(kind).join(',')
}

/** The largest upload of a kind; also the highest `maxBytes` a file field may set. */
export function limitOf(kind: 'image' | 'file'): number {
  return Math.max(...typesOf(kind).map((type) => UPLOAD_TYPES[type].limit))
}

/** Megabytes the German way: 1,5. */
export function formatMb(bytes: number): string {
  return `${roundedMb(bytes)}`.replace('.', ',')
}

/** Megabytes with one decimal, as a number (catalogs format it for the language). */
export function roundedMb(bytes: number): number {
  return Math.round((bytes / MB) * 10) / 10
}

function typesOf(kind: 'image' | 'file'): UploadType[] {
  return (Object.keys(UPLOAD_TYPES) as UploadType[]).filter((type) => UPLOAD_TYPES[type].kind === kind)
}
