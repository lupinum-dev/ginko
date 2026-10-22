// `@lupinum/ginko/internal/search`: builds the search index, for Ginko's own packages (content, platform, docs tests)
// and the search route of sites with platform bricks (nuxt/runtime/server/search.ts, which imports it by this path).
// No stability promise, like `@lupinum/ginko/internal`. Kept apart from it because it imports MiniSearch, which
// must stay out of client pages that import `/internal`. Reading an index is public: `@lupinum/ginko/search`.
export { buildIndex, indexOf, type SearchEngineData, type SearchRecord } from '../core/search.ts'
export { stemmerNow } from '../core/search-stemmers.ts'
export { searchSections, type SearchSectionsOptions } from '../core/search-sections.ts'
