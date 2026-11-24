// The runtime composables with the Nuxt app, route and config stubbed: `useI18n()` in a user-locale zone (an app such
// as the Studio), and `localePath` on a real router with the routes the module makes.
import { ref } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import { resolveConfig } from '../src/core/locales'
import { localizePages } from '../src/pages'

const route = { path: '/app', meta: {}, params: {} }
const state = { messages: {}, load: async () => {}, resolvers: [], userLocale: ref('en'), browserLanguage: ref<string | undefined>() }

vi.mock('#imports', () => ({ navigateTo: () => {}, useNuxtApp: () => ({ $ginkoI18n: state, payload: { data: {} } }), useRoute: () => route, useRouter: () => ({}) }))
vi.mock('#ginko-i18n/config.mjs', () => ({
  config: { ...resolveConfig({ locales: ['de', 'en', 'es'], defaultLocale: 'de', userLocale: ['/app'] }), seo: false, baseUrl: '', base: '', params: {}, timeZone: 'Europe/Vienna' },
}))

const { createLocalePath, useI18n } = await import('../src/runtime/composables')

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

describe('localePath', () => {
  // The routes of a site whose main language is German: a print page with its own German address, and a catch-all
  // page for content (`[...slug].vue`). The locales are those of the stubbed config above.
  const pages = [
    { name: 'menu-print', path: '/menu/print', file: '/app/pages/menu/print.vue', meta: { i18n: { paths: { de: '/speisekarte/drucken' } } } },
    { name: 'slug', path: '/:slug(.*)*', file: '/app/pages/[...slug].vue' },
  ]
  const routes = localizePages(pages, resolveConfig({ locales: ['de', 'en', 'es'], defaultLocale: 'de' }))
  const localePath = createLocalePath(createRouter({
    history: createMemoryHistory(),
    routes: routes.map(page => ({ name: page.name, path: page.path, meta: page.meta, component: {} })),
  }))

  // Wrong behaviour caught: `/menu/print` is no address in German, so the catch-all page matched it first and the
  // link "Speisekarte drucken" went to /menu/print, a 404, instead of /speisekarte/drucken.
  it.each([
    ['/menu/print', 'de', '/speisekarte/drucken'],
    ['/speisekarte/drucken?size=a4#top', 'en', '/en/menu/print?size=a4#top'],
    ['/impressum', 'en', '/en/impressum'],
  ])('%s in %s is %s', (target, code, path) => {
    expect(localePath(target, code)).toBe(path)
  })
})
