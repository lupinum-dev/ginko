// Small helpers shared by the Finder components.
import type { Label } from '@lupinum/ginko'
import type { LibFile } from '../../composables/useFilesLibrary'
import type { Chosen } from './LibraryPickerBody.vue'

export type PickKind = 'image' | 'pdf'

export const isImage = (file: Pick<LibFile, 'kind'>) => file.kind === 'image'

/** Places a file is used at: every path of every entry (deleted entries still block). */
export const placesOf = (usedIn: { paths: string[] }[]) => usedIn.reduce((sum, u) => sum + Math.max(1, u.paths.length), 0)

/** The fields a file sits in within one entry, by their labels (the path when the schema no longer has the field). */
export const fieldsText = (use: { paths: string[]; fieldLabels: (Label | null)[] }, shown: (label: Label) => string) =>
  use.paths.map((path, i) => { const label = use.fieldLabels[i]; return label ? shown(label) : path }).join(', ')

/** The drag payload that moves files into a folder. */
export const DRAG_TYPE = 'application/x-ginko-files'

/** The description a component's `alt` prop stores (it has no library fallback): the picker's own text, else the library's. */
export const textAltOf = (chosen: Chosen, locale: string) => chosen.alt?.[locale]?.trim() || chosen.libraryAlt || ''

/**
 * The description a place keeps as its own: what was typed, or nothing when it is the library's text (that applies
 * anyway, in every language, and a later fix in Files still reaches this place).
 */
export const ownAlt = (typed: string, library: string) => (typed.trim() === library.trim() ? '' : typed.trim())
