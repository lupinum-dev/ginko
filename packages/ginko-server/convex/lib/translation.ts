// Translation state of one entry in one language, from the one rule of the bundle (`resolveEntry`):
// a leaf is missing when the bundle delivers it in the main language (`fallback`), and outdated when
// its translation was made for an older main-language text (the bundle still delivers it, D6).
// ginko_read, the translation status, "why is this not public?", the Studio's notes and the message
// after a save all read it here, so they say the same.
import type { Locale } from '@lupinum/ginko'
import { leavesOf, resolveEntry, stableJson, type Schema } from '@lupinum/ginko/internal'
import type { Data, Prints } from './content'

/**
 * What the website shows of an entry in one language: nothing (`hidden`, a page whose required texts are not all
 * translated, D5), a link to its main-language page (`mainPage`, the same with `untranslated: 'fallback'`), or the
 * entry itself (`shown`), where a missing text shows in the main language.
 */
export type TranslationPage = 'hidden' | 'mainPage' | 'shown'

export interface LeafStatus {
  missing: string[]
  outdated: string[]
  /** The missing required leaves (an outdated one still counts as translated): while there is one, the entry has no page in this language. */
  blocking: string[]
  page: TranslationPage
}

type Row = { _id: string; data: unknown; prints: unknown }

export function leafStatus(schema: Schema, brick: string, row: Row, locale: Locale): LeafStatus {
  const resolved = resolveEntry(schema, brick, { id: row._id, data: row.data as Data, prints: row.prints as Prints }, { locale, files: () => undefined })
  const def = schema.bricks[brick]
  const routed = def?.kind === 'collection' && !!def.route?.[locale]
  const page = resolved.hidden ? 'hidden' : resolved.blocking.length && routed ? 'mainPage' : 'shown'
  return { missing: resolved.fallback, outdated: resolved.outdated, blocking: resolved.blocking, page }
}

/** One language in the answer of a save or create: what the website shows there now, and how many of the saved texts are missing or outdated there. */
export type TranslationNote = { locale: Locale; page: TranslationPage; missing: number; outdated: number }

/**
 * The languages the message after a save names (the written `row`, `before` the save, `roots` the fields it changed):
 * those where a text under `roots` is missing or outdated, and those where the entry has no page of its own while the
 * save changed a text. A save in a foreign language (`saved`) names only that language.
 */
export function translationNotes(schema: Schema, brick: string, row: Row, before: Data, roots: readonly string[], saved?: Locale): TranslationNote[] {
  const fields = schema.bricks[brick]!.fields
  const data = row.data as Data
  const under = (leaf: string) => roots.some((root) => leaf === root || leaf.startsWith(`${root}.`))
  const texts = (value: Data, root: string) => stableJson([...leavesOf(fields[root]!, value[root], root)])
  const textChanged = roots.some((root) => Object.hasOwn(fields, root) && texts(before, root) !== texts(data, root))
  const main = schema.locales[0]!
  const locales = saved !== undefined && saved !== main ? [saved] : schema.locales.slice(1)
  return locales.flatMap((locale) => {
    const status = leafStatus(schema, brick, row, locale)
    const note = { locale, page: status.page, missing: status.missing.filter(under).length, outdated: status.outdated.filter(under).length }
    return note.missing || note.outdated || (note.page !== 'shown' && textChanged) ? [note] : []
  })
}
