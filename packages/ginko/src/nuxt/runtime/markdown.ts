// Code access to a `markdown` field (CONTENT.md): the tree itself, for pages that split or inspect a
// text instead of rendering it whole. In page state the field is `{ ref }`, so the tree is loaded
// from the site; on the server that call stays in-process. Used inside Nuxt (auto-imported).
import { computed, toValue, type ComputedRef, type MaybeRefOrGetter } from 'vue'
import type { MarkdownTree, MarkdownValue } from '../../index.ts'
import { useAsyncData } from '#imports'

/**
 * The tree of a markdown value, for server code such as a list page's `useAsyncData` that reads
 * several texts and keeps only what the page needs. `undefined` (an optional field) gives `null`.
 */
export async function fetchGinkoMarkdown(value: MarkdownValue | undefined): Promise<MarkdownTree | null> {
  if (!value) return null
  return 'nodes' in value ? value : $fetch<MarkdownTree>(value.ref)
}

/**
 * The tree of a markdown value as page data: `const tree = await useGinkoMarkdown(() => entry.value.data.body)`.
 * A text in page state (`{ ref }`) is loaded once per ref and again when the value changes; a value
 * that already holds its tree is returned as it is.
 */
export async function useGinkoMarkdown(value: MaybeRefOrGetter<MarkdownValue | undefined>): Promise<ComputedRef<MarkdownTree | null>> {
  const ref = computed(() => {
    const v = toValue(value)
    return v && 'ref' in v ? v.ref : ''
  })
  const { data } = await useAsyncData(() => `ginko-md:${ref.value}`, () => (ref.value ? $fetch<MarkdownTree>(ref.value) : Promise.resolve(null)))
  return computed(() => {
    const v = toValue(value)
    return v && 'nodes' in v ? v : (data.value ?? null)
  })
}
