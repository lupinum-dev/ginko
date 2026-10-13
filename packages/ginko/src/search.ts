// `@lupinum/ginko/search`: the search engine (MiniSearch). A separate entry, so the default client bundle does not carry it.
// The index builders (`buildIndex`, `searchSections`) are for Ginko's own packages and come from `@lupinum/ginko/internal`.
export { loadIndex, search, type SearchHit, type SearchIndex, type SearchIndexJson } from './core/search.ts'
