import type { InjectionKey } from 'vue'
import type { Locale } from '@lupinum/ginko'

/**
 * "Adresse ändern" next to a slug field (entries.changeSlug), provided by the entry editor. `enabled`: owners and admins
 * on a saved entry of a collection with pages; otherwise, and without the provider, the address stays read-only.
 */
export interface SlugChange {
  enabled: () => boolean
  /** Whether the page is online, so the old address will forward to the new one. */
  live: () => boolean
  change: (locale: Locale, slug: string) => Promise<void>
}

export const SLUG_CHANGE = Symbol('ginko:slug-change') as InjectionKey<SlugChange>
