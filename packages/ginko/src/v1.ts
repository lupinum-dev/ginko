// @lupinum/ginko/v1: the way a site was written up to Ginko 0.18. `defineSite`, `single`, `collection` and `f` are the
// 0.18 builders; every other name is the same as in '@lupinum/ginko'. A site updates to 0.19 by changing the import
// of its config and brick files to this entry, and moves to the new form when it wants.
//
// Temporary: internals/migrations.md says when this entry is removed.
export * from './index.ts'
export { defineSite, single, collection } from './core/site.ts'
export { f } from './core/fields.ts'
