// @lupinum/ginko: the only package a customer site installs. It owns the contract between the hosted
// platform and a site (SPEC part 1): schema, validation, diff, bundle and Markdown. The platform imports
// the same functions; there is no second copy.
//
// This entry is the public API for site developers: each name here is documented on the docs site
// ("Reading content", API reference). Ginko's own packages import the rest from '@lupinum/ginko/internal',
// which has no stability promise. Adding a name here later breaks nobody; removing one breaks sites. Keep it small.
//
// `defineSite`, `single`, `collection`, `extend` and `f` are the form a site is written in (src/authoring). They
// produce the stored form (src/core), which the builders of '@lupinum/ginko/v1' write directly.
export { defineSite, type StudioInput } from './authoring/site.ts'
export {
  single, collection, extend,
  type TaskInput, type StandardTask, type ShowUntil, type SingleDef, type CollectionDef, type BrickDef, type CollectionStatusInput, type SingleStatusInput,
} from './authoring/bricks.ts'
export type { StudioTexts, BrickTexts, FieldTexts } from './authoring/labels.ts'
export type { SiteInput, Migration, MigrationContext, RouteTemplate } from './core/site.ts'
export type { LinkConfig } from './core/links.ts'
export type { Redirect } from './core/redirects.ts'
export { defineComponents, type ComponentDef, type ComponentRegistry } from './core/components.ts'
export { breadcrumbJsonLd, type SeoImage } from './core/seo.ts'
export { f } from './authoring/fields.ts'
export { formatMoney, type FormatMoneyOptions } from './core/money.ts'
export { factText, valueOn, type FactContext } from './core/facts.ts'
export { safeHref } from './core/href.ts'
export { plainText, wordsOf, type MarkdownProfile, type MarkdownValue, type MarkdownTree, type MarkdownToc, type TocLink } from './core/markdown.ts'
export { startOfWeek, type WeekInfo } from './core/time.ts'
export type { DataOf, ItemOf, Money, ImageValue, FileValue, UnknownChoice } from './core/infer.ts'
export type { NavNode } from './core/navigation.ts'
export type { Query, Condition } from './core/query.ts'
export type {
  AspectRatio, Locale, Currency, Label, Json, ChoiceOption, Task, Visibility, BrickSource, Field, Fields, SingleBrick, CollectionBrick, Brick,
  BrickStatus, CollectionStatus, SingleStatus,
} from './core/types.ts'
