// Public API of `@lupinum/ginko-i18n/core`: framework-free and parser-free. The module's own runtime
// imports this entry too, so the URL and hreflang rules it uses (`alternatesOf`, `isExcluded`, …) are
// public. A `MessageTree` is the output of `/compile`; its format is internal, so store source catalogs.
export { createTranslator, partsToString } from './messages.ts'
export type { MessageTree, Params, Part, TranslateOptions, Translator } from './messages.ts'
export { defineCatalog } from './catalog.ts'
export type { Catalog, KeysOf } from './catalog.ts'
export { createFormatters } from './format.ts'
export type { DateStyle, FormatterOptions, Formatters } from './format.ts'
export { alternatesOf, canonicalCase, inUserZone, isExcluded, localeFromPath, localizePath, negotiateLocale, ogLocale, resolveConfig, stripLocale } from './locales.ts'
export type { LocaleInfo, LocaleConfig, LocaleInput, Strategy } from './locales.ts'
