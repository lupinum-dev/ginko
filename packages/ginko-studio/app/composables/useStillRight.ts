// "Noch richtig?": a choices field with `askAgainWhen` names a text next to it; when that text changed in the main
// language and the choice did not, the person must confirm the choice (a renamed dish may need other allergens).
// Used by list rows and by entry forms, so both ask by the same rule.
import { inject, reactive } from 'vue'
import { BLOCKERS } from '@lupinum/ginko-editor'
import { stableJson } from '@lupinum/ginko/internal'
import type { Json } from '@lupinum/ginko'

/**
 * Confirmations per form (keyed by its blockers): the quick-task sheet shows a list again for each language, and a
 * confirmation given in one must not be asked for again after a switch.
 */
const confirmations = new WeakMap<Map<string, string>, Map<string, string>>()

export interface Reviewed { text: string; choice: Json | undefined }

export function useStillRight() {
  const blockers = inject(BLOCKERS, undefined)
  /** Confirmations hold the texts that were reviewed; a later change of the text asks again (Astra phase 8). */
  const confirmed = (blockers && confirmations.get(blockers)) ?? reactive(new Map<string, string>())
  if (blockers) confirmations.set(blockers, confirmed)
  return {
    /** `saved` is undefined for something not saved yet: a new dish has nothing to be still right. */
    asks(id: string, now: Reviewed, saved: Reviewed | undefined): boolean {
      if (!saved || confirmed.get(id) === now.text) return false
      return now.text !== saved.text && stableJson(now.choice ?? null) === stableJson(saved.choice ?? null)
    },
    confirm(id: string, text: string) { confirmed.set(id, text) },
  }
}
