// Public API of `@lupinum/ginko-i18n/core`. A `MessageTree` is the output of `/compile`; its shape is not
// public, so store source catalogs, not compiled trees. Ginko's own packages read the internals from `/internal`.
export { createTranslator } from './internal.ts'
export type { MessageTree, Params, Part, TranslateOptions, Translator } from './internal.ts'
export { defineCatalog } from './internal.ts'
export type { Catalog, KeysOf } from './internal.ts'
export { createFormatters } from './internal.ts'
export type { DateStyle, FormatterOptions, Formatters } from './internal.ts'
export { localeFromPath, localizePath, negotiateLocale, resolveConfig, stripLocale } from './internal.ts'
export type { Locale, LocaleConfig, LocaleInput, Strategy } from './internal.ts'
