// @lupinum/ginko/internal: everything the core exports, for Ginko's own packages (platform, Studio, editor,
// content, components, docs, presets). No stability promise: a name here can change in any release.
// Site code imports from '@lupinum/ginko'.
export * from './core/index.ts'
// The index builders import MiniSearch; `sideEffects: false` keeps it out of bundles that do not call them.
export { buildIndex, searchSections, type SearchRecord, type SearchSectionsOptions } from './core/search.ts'
