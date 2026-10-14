// `@lupinum/ginko/search`: reads a site's search index in the browser (docs: "Pages and data" and "SEO and agents").
// A separate entry, so the default client bundle does not carry the engine. Building an index is internal:
// `@lupinum/ginko/internal/search`.
export { loadIndex, search, type SearchHit, type SearchIndex, type SearchIndexJson } from './core/search.ts'
