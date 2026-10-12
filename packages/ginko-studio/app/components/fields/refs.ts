// What a ref field can point to: the entries of the target brick, by title. The Studio already loads
// them with the site (useSiteData); the editor provides them to the fields below it.
import { inject, provide, type InjectionKey } from 'vue'
import type { Locale, Schema } from '@lupinum/ginko'
import { titleOf } from '../../utils/content'
import { shownLabel } from '../../utils/labels'

export interface RefEntry { id: string; title: string }
export interface RefOptions {
  /** The live entries of a brick (drafts are not on the website, so they are not offered). */
  options: (brick: string) => RefEntry[]
  /** The brick's name for people ("Speisen"), for hints. */
  brickLabel: (brick: string) => string
}
export const REFS = Symbol('ginko:refs') as InjectionKey<RefOptions>

interface StoredLike { _id: string; brick: string; state?: 'draft' | 'live'; data: Record<string, never> | Record<string, unknown> }

export function provideRefs(schema: () => Schema, entries: () => readonly StoredLike[], main: () => Locale): void {
  provide(REFS, {
    options: (brick) => {
      const b = schema().bricks[brick]
      if (!b) return []
      return entries().filter((e) => e.brick === brick && e.state !== 'draft').map((e) => ({ id: e._id, title: titleOf(b, e.data as never, main()) }))
    },
    brickLabel: (brick) => { const label = schema().bricks[brick]?.label; return label === undefined ? brick : shownLabel(label, main()) },
  })
}

export function useRefs(): RefOptions {
  return inject(REFS, { options: () => [], brickLabel: (b) => b })
}
