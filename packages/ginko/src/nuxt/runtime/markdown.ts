// Code access to a `markdown` field (CONTENT.md): the tree itself, for pages that split or inspect a
// text instead of rendering it whole. In page state the field is `{ ref }`, so the tree is loaded
// from the site; on the server it comes from the request's own trees or stays in-process. Used inside Nuxt (auto-imported).
import { computed, toValue, type ComputedRef, type MaybeRefOrGetter } from 'vue'
import type { NuxtApp } from '#app'
import type { MarkdownTree, MarkdownValue } from '../../internal.ts'
import { tryUseNuxtApp, useAsyncData } from '#imports'

// The trees of platform bricks by ref, per server request: the plugin fills them when it swaps the trees for refs.
// Keyed by the request's ssrContext, so they are never serialized into the payload and end with the request.
const requestTrees = new WeakMap<object, Map<string, MarkdownTree>>()

/** The trees of this server request (empty outside a server render). @internal Filled by the Ginko plugin. */
export function serverTrees(nuxtApp: NuxtApp): Map<string, MarkdownTree> {
  const context = nuxtApp.ssrContext
  if (!context) return new Map()
  let trees = requestTrees.get(context)
  if (!trees) requestTrees.set(context, (trees = new Map()))
  return trees
}

/** A tree by its ref: from the server request when the plugin holds it (no request), else from the site route. */
function loadTree(ref: string, nuxtApp: NuxtApp | undefined = tryUseNuxtApp() ?? undefined): Promise<MarkdownTree> {
  const tree = import.meta.server && nuxtApp?.ssrContext ? requestTrees.get(nuxtApp.ssrContext)?.get(ref) : undefined
  return tree ? Promise.resolve(tree) : $fetch<MarkdownTree>(ref)
}

/**
 * The tree of a markdown value, for server code such as a list page's `useAsyncData` that reads
 * several texts and keeps only what the page needs. `undefined` (an optional field) gives `null`.
 */
export async function fetchGinkoMarkdown(value: MarkdownValue | undefined): Promise<MarkdownTree | null> {
  if (!value) return null
  return 'nodes' in value ? value : loadTree(value.ref)
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
  const { data } = await useAsyncData(() => `ginko-md:${ref.value}`, (nuxtApp) => (ref.value ? loadTree(ref.value, nuxtApp) : Promise.resolve(null)))
  return computed(() => {
    const v = toValue(value)
    return v && 'nodes' in v ? v : (data.value ?? null)
  })
}
