// Public API of `@lupinum/ginko-i18n/compile`: turn source catalogs (ICU strings) into the trees that
// `createTranslator` and `defineCatalog` read. Runs at build time; it loads the FormatJS parser.
export { compileCatalogs, compileTree, MessageError } from './compiler.ts'
export type { RawTree } from './compiler.ts'
