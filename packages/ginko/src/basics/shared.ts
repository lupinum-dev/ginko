// What every basics factory shares: the options, `source` only when set, and labels in the Studio's languages.
import type { BrickSource, Label } from '../core/types.ts'

export { studioLabel as t } from '../core/labels.ts'

/** Options every basics factory takes. */
export interface BasicsOptions {
  /** Where the content comes from: absent means the Ginko platform (the owner edits it), `'files'` means files in `content/`. */
  source?: BrickSource
  /** Replaces the brick's label in the Studio: a text, or one text per language. */
  label?: Label
}

/** `source` as a brick property, only when set, so a platform brick's schema stays as it was. */
export const sourceOf = (o: BasicsOptions) => (o.source ? { source: o.source } : {})

/** Drops keys whose value is undefined or an empty list, so optional data does not appear in the JSON-LD. */
export const compact = (o: Record<string, unknown>): Record<string, unknown> =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== '' && !(Array.isArray(v) && v.length === 0)))

/** A schema.org PostalAddress, or undefined when no part of it is known. `country` is an ISO 3166 code from the site's config. */
export function postalAddress(a: { street?: string; postalCode?: string; city?: string; country?: string }): Record<string, unknown> | undefined {
  if (!a.street && !a.postalCode && !a.city) return undefined
  return compact({ '@type': 'PostalAddress', streetAddress: a.street, postalCode: a.postalCode, addressLocality: a.city, addressCountry: a.country })
}
