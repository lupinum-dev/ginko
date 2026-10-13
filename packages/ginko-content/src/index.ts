// @lupinum/ginko-content (CONTENT.md): bricks with `source: 'files'` read from Markdown, YAML, JSON and CSV files.
// Node only; the Vue renderer is `<GinkoMarkdown>` from `@lupinum/ginko`. These exports are the contract with the
// Ginko module and CLI, which load this package; sites do not import it (README "Stability").
export { errorLine, readContent, type ContentError, type ReadOptions, type ReadResult } from './read.ts'
export { buildFileBundles, publicBundle, withMarkdownRefs, type BuildOptions } from './bundle.ts'
export { searchIndex } from './search.ts'
