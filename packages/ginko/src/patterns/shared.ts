// What every function of functions.ts shares: the options and labels in the Studio's languages.
import type { Label } from '../core/types.ts'

export { studioLabel as t } from '../core/labels.ts'

/** Options every function of functions.ts takes. */
export interface BasicsOptions {
  /** Replaces the brick's label in the Studio: a text, or one text per language. */
  label?: Label
}

