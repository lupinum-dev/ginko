// Every text the server sends to a person (errors, mail) comes from a catalog in `i18n/<locale>.json`
// and is written in that person's language. German is the source language and the fallback: a locale
// that lacks a key, or a locale nobody supports, shows the German text. A new language is a new
// catalog file plus one import line in `CATALOGS`.
import { compileCatalogs, type RawTree } from '@lupinum/ginko-i18n/compile'
import { defineCatalog, type KeysOf, type Params, type TranslateOptions } from '@lupinum/ginko-i18n/core'
import de from '../../i18n/de.json'
import en from '../../i18n/en.json'
import es from '../../i18n/es.json'
import type { QueryCtx } from '../_generated/server'

export type MessageKey = KeysOf<typeof de>

export const DEFAULT_LOCALE = 'de'
export const CATALOGS: Record<string, RawTree> = { de, en, es }
export const LOCALES = Object.keys(CATALOGS)

/** Compiled once when the module loads, not per call. */
const catalog = defineCatalog<MessageKey>(compileCatalogs(CATALOGS), { defaultLocale: DEFAULT_LOCALE })

export const isLocale = (value: unknown): value is string => catalog.isLocale(value)

/**
 * The text for `key` in `locale`. An unknown locale gets German; a key missing there falls back to German.
 * `options.timeZone` is the zone of the dates in `params` (a site's zone), not the reader's.
 */
export function t(locale: string | undefined, key: MessageKey, params?: Params, options?: TranslateOptions): string {
  return catalog.t(locale, key, params, options)
}

/** The language a person chose (`userSettings.locale`), else German. */
export async function localeOfUser(ctx: Pick<QueryCtx, 'db'>, userId: string | undefined): Promise<string> {
  if (!userId) return DEFAULT_LOCALE
  const row = await ctx.db.query('userSettings').withIndex('by_user', (q) => q.eq('user', userId)).unique()
  // The chosen language, else the one the person's browser showed the Studio in.
  return isLocale(row?.locale) ? row.locale : isLocale(row?.seenLocale) ? row.seenLocale : DEFAULT_LOCALE
}
