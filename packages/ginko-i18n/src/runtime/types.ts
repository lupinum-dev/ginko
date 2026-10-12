// Types shared by app and server runtime. No `#imports` here: the server type program loads this file.
import type { Ref } from 'vue'
import type { RouteLocationNormalizedGeneric } from 'vue-router'
import type { Locale, LocaleConfig, MessageTree, Params, Part, TranslateOptions } from '@lupinum/ginko-i18n/core'

declare global {
  /**
   * Generated per app (`.nuxt/types/ginko-i18n.d.ts`): every key of the default locale mapped to an
   * object type of its required parameters, e.g. `'home.cart': { count: number }`, `'nav.home': {}`.
   */
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type -- apps augment this interface with their generated message keys
  interface GinkoI18nMessages {}
}

type Known = keyof GinkoI18nMessages extends never ? false : true
type AllKeys = Known extends true ? keyof GinkoI18nMessages & string : string
// `K` is a type parameter, so the conditional distributes over every key in the union.
type Strip<K, NS extends string> = K extends `${NS}.${infer Rest}` ? Rest : never
/** Keys of namespace `NS` (`''` = the whole message tree), relative to that namespace. */
export type KeysIn<NS extends string> = NS extends '' ? AllKeys : Strip<AllKeys, NS>
type FullKey<NS extends string, K extends string> = NS extends '' ? K : `${NS}.${K}`
/**
 * Arguments after the key. A key without parameters takes an optional `Params` object; a key with
 * parameters takes its own names with their types (`number` for plural and number arguments). Global
 * parameters (`options.params`) are never required.
 */
export type ParamsFor<NS extends string, K extends string> = Known extends true
  ? FullKey<NS, K> extends keyof GinkoI18nMessages
    ? keyof GinkoI18nMessages[FullKey<NS, K>] extends never
      ? [params?: Params, options?: TranslateOptions]
      : [params: GinkoI18nMessages[FullKey<NS, K>] & Params, options?: TranslateOptions]
    : [params?: Params, options?: TranslateOptions]
  : [params?: Params, options?: TranslateOptions]
/** A full message key (`<I18nT k>` takes full keys only: a namespace prop could not be checked together with `k`). */
export type TKey = AllKeys

/** The typed `t` and `parts` of a translator for namespace `NS`. Missing keys and parameters fail typecheck. */
export interface TypedTranslator<NS extends string = ''> {
  t: <K extends KeysIn<NS>>(key: K, ...params: ParamsFor<NS, K>) => string
  parts: <K extends KeysIn<NS>>(key: K, ...params: ParamsFor<NS, K>) => Part[]
  has: (key: KeysIn<NS>) => boolean
}

export interface RuntimeConfig extends LocaleConfig {
  seo: boolean
  baseUrl: string
  /** `app.baseURL` without the trailing slash, e.g. `/sub` or ``. Router paths never include it. */
  base: string
  params: Params
  /** IANA time zone for timestamps in `format.date` and `format.relative`. */
  timeZone: string
}

export interface Alternate extends Locale {
  path: string
  current: boolean
  /** False when this page has no version in that locale; `path` then points to the locale's home. */
  translated: boolean
}

export type AlternatesResolver = (
  // Generic, not the typed-router union: a resolver belongs to one page and reads its own params.
  to: RouteLocationNormalizedGeneric,
  helpers: { locale: string, localePath: (path: string, code: string) => string },
) => Promise<Record<string, string | undefined> | undefined> | Record<string, string | undefined> | undefined

export interface I18nState {
  messages: Record<string, MessageTree>
  load: (code: string) => Promise<void>
  /**
   * The locale of user-locale zones (`useState('ginko-i18n:user-locale')`): set on the server from the
   * cookie or Accept-Language, read from the payload on the client, changed only by `switchLocale`.
   */
  userLocale: Ref<string>
  /** Set while rendering an island: its page's locale, since islands have no route of their own. */
  fixedLocale?: string
  /**
   * Libraries that own dynamic routes (a CMS) add a resolver here from their plugin. A page's own
   * `definePageMeta({ alternates })` wins; otherwise the first resolver that returns paths does.
   */
  resolvers: AlternatesResolver[]
}
