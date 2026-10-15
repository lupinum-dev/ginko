// `useI18n()` in a user-locale zone (an app such as the Studio), with the Nuxt app, route and config stubbed.
import { ref } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import { resolveConfig } from '../src/core/locales'

const route = { path: '/app', meta: {}, params: {} }
const state = { messages: {}, load: async () => {}, resolvers: [], userLocale: ref('en'), browserLanguage: ref<string | undefined>() }

vi.mock('#imports', () => ({ navigateTo: () => {}, useNuxtApp: () => ({ $ginkoI18n: state, payload: { data: {} } }), useRoute: () => route, useRouter: () => ({}) }))
vi.mock('#ginko-i18n/config.mjs', () => ({
  config: { ...resolveConfig({ locales: ['de', 'en', 'es'], defaultLocale: 'de', userLocale: ['/app'] }), seo: false, baseUrl: '', base: '', params: {}, timeZone: 'Europe/Vienna' },
}))

const { useI18n } = await import('../src/runtime/composables')

describe('useI18n in a user-locale zone', () => {
  // Wrong behaviour caught: an English Studio in an en-GB browser showed US dates (10/25/2026) (regress-9), or the
  // browser's region also changed numbers ("2 000" in a de-AT browser instead of "2.000").
  it.each([
    ['en', 'en-GB', '25/10/2026', '2,000'],
    ['en', 'en-US', '10/25/2026', '2,000'],
    ['en', undefined, '10/25/2026', '2,000'],
    ['de', 'de-AT', '25.10.2026', '2.000'],
  ])('%s in a %s browser writes dates as %s and numbers as %s', (locale, browser, date, number) => {
    state.userLocale.value = locale
    state.browserLanguage.value = browser
    const { format } = useI18n()
    expect([format.date('2026-10-25', { day: '2-digit', month: '2-digit', year: 'numeric' }), format.number(2000)]).toEqual([date, number])
  })
})
