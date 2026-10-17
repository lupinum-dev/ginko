// What a ref field can point to: the entries of the target brick, by title. The editor provides how to read them
// (provideSiteRefs: each ref field reads the titles of its own target brick when it is shown).
import { computed, inject, provide, type ComputedRef, type InjectionKey } from 'vue'

export interface RefEntry { id: string; title: string }
export interface RefOptions {
  /** The live entries of a brick (drafts are not on the website, so they are not offered). Call once in setup. */
  options: (brick: () => string) => ComputedRef<RefEntry[]>
  /** The brick's name for people ("Speisen"), for hints. */
  brickLabel: (brick: string) => string
}
export const REFS = Symbol('ginko:refs') as InjectionKey<RefOptions>

export function provideRefs(refs: RefOptions): void {
  provide(REFS, refs)
}

export function useRefs(): RefOptions {
  return inject(REFS, { options: () => computed(() => []), brickLabel: (b) => b })
}
