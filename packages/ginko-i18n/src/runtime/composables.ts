import { computed, onMounted, ref } from 'vue'
import type { RouteLocationRaw, RouteParamsGeneric, Router } from 'vue-router'
import { navigateTo, useNuxtApp, useRoute, useRouter } from '#imports'
import { config } from '#ginko-i18n/config.mjs'
import { createFormatters, createTranslator, inUserZone, localeFromPath, localizePath, negotiateLocale, stripLocale, type Formatters, type LocaleConfig } from '@lupinum/ginko-i18n/core'
import type { Alternate, AlternatesResolver, I18nState, KeysIn, ParamsFor, RuntimeConfig, TypedTranslator } from './types'

const c: RuntimeConfig = config

/** The locale of a route: from the URL, or `userLocale` (the user's setting) inside a user-locale zone. */
export function currentLocale(path: string, cfg: LocaleConfig = c, userLocale?: string): string {
  if (inUserZone(path, cfg)) return userLocale ?? cfg.defaultLocale
  return localeFromPath(path, cfg) ?? cfg.defaultLocale
}

/** Remember the visitor's locale for the next visit (read by the server middleware). */
export function writeLocaleCookie(code: string) {
  document.cookie = `ginko_locale=${code}; path=${c.base || '/'}; max-age=31536000; samesite=lax`
}

/** Payload data key for a dynamic page's alternates, filled by `definePageMeta({ alternates })` (see plugin). */
export const alternatesKey = (path: string) => `ginko-i18n:alternates:${path}`

/** Resolve a path written in any locale (or unprefixed) to the same page in `code`. */
export function createLocalePath(router: Router) {
  return (target: string, code: string): string => {
    // eslint-disable-next-line regexp/no-super-linear-backtracking -- linear: `[^?#]*` cannot overlap `.*`, which only takes the rest
    const match = /^([^?#]*)(.*)$/.exec(target)!
    const path = match[1] || '/'
    const tail = match[2] ?? ''
    const bare = stripLocale(path, c)
    for (const candidate of [path, ...c.locales.map(l => localizePath(bare, l.code, c))]) {
      const resolved = router.resolve(candidate)
      const base = resolved.meta.i18nBase as string | undefined
      if (!resolved.matched.length || !base) continue
      const name = `${base}__${code}`
      if (!router.hasRoute(name)) return localizePath('/', code, c)
      return resolveClone(router, name, resolved.params) + tail
    }
    return localizePath(bare, code, c) + tail
  }
}

// Locale clones are named `${base}__${code}` at build time. The name is computed here, so the typed
// router (vue-router 5 / Nuxt 5) cannot check it against its route map.
function resolveClone(router: Router, name: string, params: RouteParamsGeneric) {
  return router.resolve({ name, params } as RouteLocationRaw).path
}

export function useI18n<NS extends string = ''>(namespace?: NS) {
  const nuxtApp = useNuxtApp()
  const state = nuxtApp.$ginkoI18n as I18nState
  const route = useRoute()
  const router = useRouter()

  const zone = computed(() => inUserZone(route.path, c))
  const locale = computed(() => state.fixedLocale ?? currentLocale(route.path, c, state.userLocale.value))
  const current = computed(() => c.locales.find(l => l.code === locale.value)!)
  const translator = computed(() => createTranslator({
    messages: state.messages[locale.value],
    language: current.value.language,
    params: c.params,
    timeZone: c.timeZone,
    onMissing: import.meta.dev ? key => console.warn(`[ginko-i18n] Missing message "${key}" (${locale.value})`) : undefined,
  }))
  const prefix = namespace ? `${namespace}.` : ''

  const resolvePath = createLocalePath(router)
  const localePath = (target: string, code: string = locale.value) => resolvePath(target, code)

  const alternates = computed<Alternate[]>(() => {
    // A user-locale zone has one URL for every locale, so there is no other page to link to.
    if (zone.value) return []
    const override = nuxtApp.payload.data[alternatesKey(route.path)] as Record<string, string> | undefined
    const base = route.meta.i18nBase as string | undefined
    return c.locales.map((l) => {
      let path: string | undefined
      if (override) path = override[l.code]
      else if (base && router.hasRoute(`${base}__${l.code}`))
        path = resolveClone(router, `${base}__${l.code}`, route.params)
      return { ...l, path: path ?? localizePath('/', l.code, c), current: l.code === locale.value, translated: !!path }
    })
  })

  const typed: TypedTranslator<NS> = {
    t: (key, ...params) => translator.value.t(prefix + key, params[0], params[1]),
    parts: (key, ...params) => translator.value.parts(prefix + key, params[0], params[1]),
    has: key => translator.value.has(prefix + key),
  }

  /**
   * Change the language. In a user-locale zone: remember it in the cookie and re-render in place.
   * On a URL-localized page: go to the same page in `code` (the locale's home when not translated).
   */
  async function switchLocale(code: string) {
    if (!c.locales.some(l => l.code === code))
      throw new Error(`[ginko-i18n] switchLocale("${code}"): unknown locale. Fix: use one of ${c.locales.map(l => `"${l.code}"`).join(', ')}.`)
    if (zone.value) {
      if (import.meta.client) writeLocaleCookie(code)
      await state.load(code)
      state.userLocale.value = code
      return
    }
    await navigateTo(alternates.value.find(a => a.code === code)!.path)
  }

  // A plain object, not a computed: `format.date(…)` reads the current language like `t` does, in script and template.
  const formatters = () => createFormatters(current.value.language, { timeZone: c.timeZone })
  const format: Formatters = {
    date: (...args) => formatters().date(...args),
    range: (...args) => formatters().range(...args),
    relative: (...args) => formatters().relative(...args),
    number: (...args) => formatters().number(...args),
    currency: (...args) => formatters().currency(...args),
    list: (...args) => formatters().list(...args),
  }

  return {
    ...typed,
    locale,
    language: computed(() => current.value.language),
    locales: c.locales,
    defaultLocale: c.defaultLocale,
    localePath,
    alternates,
    switchLocale,
    format,
  }
}

/**
 * The visitor's browser prefers another locale that has this page. `null` on the server and
 * during hydration, so it never changes the first render.
 */
export function useLocaleSuggestion() {
  const { alternates, locale } = useI18n()
  const preferred = ref<string>()
  onMounted(() => {
    preferred.value = negotiateLocale(navigator.languages.join(','), c)
  })
  return computed(() => {
    if (!preferred.value || preferred.value === locale.value) return null
    return alternates.value.find(a => a.code === preferred.value && a.translated) ?? null
  })
}

/**
 * For a library's Nuxt plugin that owns dynamic routes (a CMS): give a route's path per locale, or
 * `undefined` when the route is not yours. A page's own `definePageMeta({ alternates })` wins; otherwise
 * the first resolver that returns paths does.
 */
export function addAlternatesResolver(resolver: AlternatesResolver) {
  (useNuxtApp().$ginkoI18n as I18nState).resolvers.push(resolver)
}
