// @lupinum/ginko: the only package a customer site installs. It owns the contract between the hosted
// platform and a site (SPEC part 1): schema, validation, diff, bundle and Markdown. The platform imports
// the same functions; there is no second copy.
//
// This entry is for site developers: each name here follows semver and is documented on the docs site.
// Ginko's own packages import the rest from '@lupinum/ginko/internal', which has no stability promise.
// Adding a name here later is a minor release; removing one is a major. Keep it small.
export { defineSite, single, collection, type SiteInput, type Migration, type MigrationContext } from './core/site.ts'
export { f } from './core/fields.ts'
export { formatMoney } from './core/money.ts'
export { plainText, type MarkdownValue, type MarkdownTree, type MarkdownToc, type TocLink } from './core/markdown.ts'
export { weekStartOf, type WeekInfo } from './core/time.ts'
export type { DataOf, ValueOf, BrickValue, ItemOf, Money, ImageValue, FileValue, UnknownChoice } from './core/infer.ts'
export type { NavNode } from './core/navigation.ts'
export type { Query, QueryResult, Condition } from './core/query.ts'
export type {
  Locale, Currency, Label, Json, Localized, Option, PrefillToken, Task, Visibility, BrickSource,
  Field, FieldType, Fields, TextField, LongTextField, MarkdownField, NumberField, MoneyField, BooleanField, DateField,
  TimeField, DateRangeField, ChoiceField, ChoicesField, ListField, RefField, ImageField, FileField, SlugField,
  SingleBrick, CollectionBrick, Brick,
} from './core/types.ts'
