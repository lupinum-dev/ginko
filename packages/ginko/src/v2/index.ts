// POC T2: `@lupinum/ginko/v2`, the v2 way to write a site's content model (ginko-internal: specs/V2-AUTHORING.md).
// It is a layer on top of v1: a v2 config produces the v1 site object and so the same stored model.
export { defineSite, type StudioInput } from './site.ts'
export { single, collection, type TaskInput, type StandardTask, type SingleV2, type CollectionV2, type BrickV2 } from './bricks.ts'
export { f } from './fields.ts'
export type { StudioTexts, BrickTexts, FieldTexts } from './labels.ts'
