// What every basics factory shares: the options and labels in the Studio's languages.
import type { Label } from '../core/types.ts'

export { studioLabel as t } from '../core/labels.ts'

/** Options every basics factory takes. */
export interface BasicsOptions {
  /** Replaces the brick's label in the Studio: a text, or one text per language. */
  label?: Label
}

