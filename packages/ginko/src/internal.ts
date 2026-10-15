// @lupinum/ginko/internal: everything the core exports, for Ginko's own packages (platform, Studio, editor,
// content, components, docs, presets). No stability promise: a name here can change in any release.
// Site code imports from '@lupinum/ginko'.
export * from './core/index.ts'
// The export folder's layout, shared by `ginko export` and the Studio's backup download.
export { defaultDir, pathOf } from './cli/model.ts'
