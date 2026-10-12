// Test stand-in for Nuxt's '#imports': just the state, route, config and error helpers the runtime
// composables call. Vue is the package's own, so composables and tests share one instance.
import { computed, ref, toValue, type Ref } from 'vue'
import { createFormatters, createTranslator } from '@lupinum/ginko-i18n/core'
import { compileCatalogs } from '@lupinum/ginko-i18n/compile'

export { computed, ref, toValue }

const states = new Map<string, Ref<unknown>>()

export function useState<T>(key: string, init?: () => T): Ref<T> {
  let state = states.get(key)
  if (!state) {
    state = ref(init ? init() : undefined)
    states.set(key, state)
  }
  return state as Ref<T>
}

export function resetStates() {
  states.clear()
}

/** The locale ginko-i18n's `useI18n()` reports; tests set it. */
export const i18nLocale = ref('de')

/** The locales ginko-i18n reports: `languages: { de: 'de-AT' }` in the site config gives `de` its tag, `en` has none. */
export const i18nLocales = [{ code: 'de', language: 'de-AT' }, { code: 'en', language: 'en' }]

/** The Studio's German catalog, read through ginko-i18n's real translator (the language the Studio tests read). */
const studioMessages = compileCatalogs({ de: (await import('../../../ginko-studio/i18n/de.json')).default }).de
const i18nZone = 'Europe/Vienna'

/** The real translator and formatters of ginko-i18n, for the locale tests set. */
export function useI18n<NS extends string = ''>(_namespace?: NS) {
  const current = i18nLocales.find(l => l.code === i18nLocale.value) ?? i18nLocales[0]!
  const translator = createTranslator({ messages: studioMessages, language: current.language, timeZone: i18nZone })
  return {
    locale: computed(() => i18nLocale.value),
    locales: i18nLocales,
    t: translator.t,
    format: createFormatters(current.language, { timeZone: i18nZone }),
  }
}

/** The path `useRoute()` reports; tests set it. */
export const routePath = ref('/')

export function useRoute() {
  return { path: routePath.value }
}

/** The argument of the last `useHead(...)` call, resolved: tests read what the page head would hold. */
export let head: unknown
export function useHead(input: unknown) {
  head = typeof input === 'function' ? (input as () => unknown)() : input
}

/** `seo` of the site config; tests set it. */
export const seoConfig: Record<string, unknown> = {}

export function useRuntimeConfig() {
  return { public: { ginko: { site: 'restaurant', name: 'Restaurant', url: 'https://restaurant.test', seo: seoConfig, platform: 'https://platform.test', locales: ['de', 'en'], mainLocale: 'de', timezone: 'Europe/Vienna' } } }
}

export function createError(options: { statusCode: number; statusMessage: string; fatal?: boolean }) {
  return Object.assign(new Error(options.statusMessage), options)
}

export type { ComputedRef, MaybeRefOrGetter } from 'vue'
export type { Ref }
