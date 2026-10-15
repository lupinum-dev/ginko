// Translation state of one entry in one language, from the one rule of the bundle (`resolveEntry`):
// a leaf is missing when the bundle delivers it in the main language (`fallback`), and outdated when
// its translation was made for an older main-language text (the bundle still delivers it, D6).
// ginko_read, the translation status and "why is this not public?" all read it here, so their numbers match.
import type { Locale } from '@lupinum/ginko'
import { resolveEntry, type Schema } from '@lupinum/ginko/internal'
import type { Data, Prints } from './content'

export interface LeafStatus {
  missing: string[]
  outdated: string[]
  /** A required leaf is missing (an outdated one still counts as translated): a routed entry has no page in this language. */
  untranslated: boolean
  /** Untranslated in a collection whose mode is `'hide'`: the bundle leaves the entry out in this language. */
  hidden: boolean
}

export function leafStatus(schema: Schema, brick: string, row: { _id: string; data: unknown; prints: unknown }, locale: Locale): LeafStatus {
  const resolved = resolveEntry(schema, brick, { id: row._id, data: row.data as Data, prints: row.prints as Prints }, { locale, files: () => undefined })
  return { missing: resolved.fallback, outdated: resolved.outdated, untranslated: resolved.untranslated, hidden: resolved.hidden }
}
