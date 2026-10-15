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
