// Public API of `@lupinum/ginko-i18n/compile`: turn source catalogs (ICU strings) into the trees that
// `createTranslator` and `defineCatalog` read. Runs at build time; it loads the FormatJS parser.
// The format of a compiled tree is internal and may change in any release: compile it again after an upgrade.
export { compileCatalogs, compileTree, MessageError } from './compiler.ts'
export type { CompiledTree, RawTree } from './compiler.ts'
