// @lupinum/ginko-content (CONTENT.md): bricks with `source: 'files'` read from Markdown files.
// Node only; the Vue renderer is `<GinkoMarkdown>` from `@lupinum/ginko`.
export { readContent, type ContentError, type ReadOptions, type ReadResult } from './read.ts'
export { buildFileBundles, withMarkdownRefs } from './bundle.ts'
export { searchIndex } from './search.ts'
