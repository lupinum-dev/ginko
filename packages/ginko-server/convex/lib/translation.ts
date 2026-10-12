// Translation state of one entry in one language, from the one rule of the bundle (`resolveEntry`):
// a leaf is "fallback" when its translation is missing or outdated. A leaf that has a text in the
// language is outdated, one without is missing. ginko_read, the translation status and
// "why is this not public?" all read it here, so their numbers match.
import type { Json, Locale } from '@lupinum/ginko'
import { resolveEntry, type Schema } from '@lupinum/ginko/internal'
import { valueAt, type Data, type Prints } from './content'

export interface LeafStatus {
  missing: string[]
  outdated: string[]
  /** `missing: 'hide'` and a required leaf is missing or outdated: the bundle leaves the entry out in this language. */
  hidden: boolean
}

/** Splits the bundle's fallback leaves of an entry into the outdated ones (a text exists) and the rest (missing). */
export function splitFallback(data: Data, leaves: readonly string[], locale: string): { missing: string[]; outdated: string[] } {
  const missing: string[] = []
  const outdated: string[] = []
  for (const leaf of leaves) {
    const own = (valueAt(data, leaf) as Record<string, Json> | undefined)?.[locale]
    if (typeof own === 'string' && own !== '') outdated.push(leaf)
    else missing.push(leaf)
  }
  return { missing, outdated }
}

export function leafStatus(schema: Schema, brick: string, row: { _id: string; data: unknown; prints: unknown }, locale: Locale): LeafStatus {
  const resolved = resolveEntry(schema, brick, { id: row._id, data: row.data as Data, prints: row.prints as Prints }, { locale, files: () => undefined })
  return { ...splitFallback(row.data as Data, resolved.fallback, locale), hidden: resolved.hidden }
}
