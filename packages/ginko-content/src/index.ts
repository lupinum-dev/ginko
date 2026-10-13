// @lupinum/ginko-content (CONTENT.md): bricks with `source: 'files'` read from Markdown, YAML, JSON and CSV files.
// Node only; the Vue renderer is `<GinkoMarkdown>` from `@lupinum/ginko`. These exports are the contract with the
// Ginko module and CLI, which load this package; sites do not import it (README "Stability").
export { errorLine, type ContentError } from './read.ts'
export { buildFileBundles, publicBundle, withMarkdownRefs, type BuildOptions, type BuildResult } from './bundle.ts'
export { searchIndex } from './search.ts'
