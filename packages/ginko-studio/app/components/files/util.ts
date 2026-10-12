// Small helpers shared by the Finder components.
import type { Label } from '@lupinum/ginko'
import type { LibFile } from '../../composables/useFilesLibrary'

export type PickKind = 'image' | 'pdf'

export const isImage = (file: Pick<LibFile, 'kind'>) => file.kind === 'image'

/** "340 KB", "2.4 MB". */
export function sizeText(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/** Places a file is used at: every path of every entry (deleted entries still block). */
export const placesOf = (usedIn: { paths: string[] }[]) => usedIn.reduce((sum, u) => sum + Math.max(1, u.paths.length), 0)

/** The fields a file sits in within one entry, by their labels (the path when the schema no longer has the field). */
export const fieldsText = (use: { paths: string[]; fieldLabels: (Label | null)[] }, shown: (label: Label) => string) =>
  use.paths.map((path, i) => { const label = use.fieldLabels[i]; return label ? shown(label) : path }).join(', ')

/** The drag payload that moves files into a folder. */
export const DRAG_TYPE = 'application/x-ginko-files'
