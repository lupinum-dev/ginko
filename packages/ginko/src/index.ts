// @lupinum/ginko: the only package a customer site installs. It owns the contract between the hosted
// platform and a site (SPEC part 1): schema, validation, diff, bundle and Markdown. The platform imports
// the same functions; there is no second copy.
//
// This entry is the public API for site developers: each name here is documented on the docs site
// ("Reading content", API reference). Ginko's own packages import the rest from '@lupinum/ginko/internal',
// which has no stability promise. Adding a name here later breaks nobody; removing one breaks sites. Keep it small.
export { defineSite, single, collection, type SiteInput, type Migration, type MigrationContext, type RouteTemplate } from './core/site.ts'
export type { LinkConfig } from './core/links.ts'
export type { Redirect } from './core/redirects.ts'
export { defineComponents, type ComponentDef, type ComponentRegistry } from './core/components.ts'
export { breadcrumbJsonLd, type SeoImage } from './core/seo.ts'
export { f } from './core/fields.ts'
export { formatMoney, type FormatMoneyOptions } from './core/money.ts'
export { safeHref } from './core/href.ts'
export { plainText, wordsOf, type MarkdownProfile, type MarkdownValue, type MarkdownTree, type MarkdownToc, type TocLink } from './core/markdown.ts'
export { startOfWeek, type WeekInfo } from './core/time.ts'
export type { DataOf, ItemOf, Money, ImageValue, FileValue, UnknownChoice } from './core/infer.ts'
export type { NavNode } from './core/navigation.ts'
export type { Query, Condition } from './core/query.ts'
export type {
  Locale, Currency, Label, Json, ChoiceOption, Task, Visibility, BrickSource, Field, Fields, SingleBrick, CollectionBrick, Brick,
  BrickStatus, CollectionStatus, SingleStatus,
} from './core/types.ts'
