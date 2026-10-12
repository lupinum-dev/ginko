// A set of compiled message trees outside Nuxt (Convex, scripts, framework-free libraries): one
// translator per locale, the default locale fills gaps, and an unknown locale gets the default.
import { createTranslator, type MessageTree, type Params, type TranslateOptions, type Translator } from './messages.ts'

/** Dotted keys of a raw catalog type: `KeysOf<typeof de>` → `'errors.noAccess' | 'mail.invite.subject'`. */
export type KeysOf<T, P extends string = ''> = {
  [K in keyof T & string]: T[K] extends string ? `${P}${K}` : KeysOf<T[K], `${P}${K}.`>
}[keyof T & string]

export interface Catalog<K extends string = string> {
  /** Locale codes that have a tree, in the order given. */
  locales: string[]
  defaultLocale: string
  isLocale: (value: unknown) => value is string
  /** The text in `locale`; an unknown or missing locale gets the default locale. */
  t: (locale: string | undefined, key: K, params?: Params, options?: TranslateOptions) => string
  /** The full translator of one locale (`parts`, `has`), with the same fallback. */
  translator: (locale: string | undefined) => Translator
}

/**
 * Pass the key type explicitly, so the trees can come precompiled (no parser at runtime):
 * `defineCatalog<KeysOf<typeof de>>(compiled, { defaultLocale: 'de' })`.
 */
export function defineCatalog<K extends string = string>(
  trees: Record<string, MessageTree>,
  options: { defaultLocale: string, params?: Params },
): Catalog<K> {
  const fallback = trees[options.defaultLocale]
  if (!fallback) throw new Error(`[ginko-i18n] defineCatalog: no messages for the default locale "${options.defaultLocale}".`)
  const isLocale = (value: unknown): value is string => typeof value === 'string' && Object.hasOwn(trees, value)
  const translators = new Map<string, Translator>()
  const translator = (locale: string | undefined): Translator => {
    // A full tag (`en-US`, from a browser or a mail header) finds its language's catalog.
    const base = locale?.split('-')[0]
    const code = isLocale(locale) ? locale : isLocale(base) ? base : options.defaultLocale
    let found = translators.get(code)
    if (!found) translators.set(code, found = createTranslator({ messages: trees[code], fallback, language: code, params: options.params }))
    return found
  }
  return {
    locales: Object.keys(trees),
    defaultLocale: options.defaultLocale,
    isLocale,
    t: (locale, key, params, options) => translator(locale).t(key, params, options),
    translator,
  }
}
