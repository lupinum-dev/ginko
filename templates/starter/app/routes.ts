// The languages of this site (TEMPLATES T8). The first language is the main one: its addresses have no prefix, the
// others start with /<code>. `npm create ginko -- --locales` edits the `locales` list. The addresses themselves are
// in ginko.config.ts (`pages`, `entries`), written once for every language.
export const locales = ['en', 'de'] as const
export type SiteLocale = (typeof locales)[number]
