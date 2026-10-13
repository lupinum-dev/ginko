// The build-time search index (CONTENT.md, Phase 14): sections of every file item with a URL, as a serialized MiniSearch index.
import type { MarkdownTree } from '@lupinum/ginko'
import type { Bundle, Schema } from '@lupinum/ginko/internal'
import { buildIndex, searchSections, type SearchIndexJson } from '@lupinum/ginko/search'

/**
 * The serialized search index of one locale's bundle (see searchSections). `bundle` must hold the `{ ref }`
 * markdown values that withMarkdownRefs wrote, and `trees` the trees behind those refs.
 */
export function searchIndex(bundle: Bundle, trees: Map<string, MarkdownTree>, schema: Schema): SearchIndexJson {
  return buildIndex(searchSections(bundle, { schema, trees }), bundle.locale)
}
