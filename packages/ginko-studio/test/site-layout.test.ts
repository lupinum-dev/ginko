// @vitest-environment happy-dom
// The frame of every site page. The German catalog is the real one; Nuxt's auto-imports become globals, Convex is replaced.
import { mount } from '@vue/test-utils'
import * as vue from 'vue'
import { beforeEach, expect, test, vi } from 'vitest'
import { ConvexError } from 'convex/values'
import { normalizeConvexError } from '@lupinum/better-convex-nuxt/errors'
import { useI18n } from '#imports'
import { isNoAccess, isSignInRequired, opErrorOf } from '../app/composables/useOps'
import { siteOrigin } from '../app/utils/origin'
import SiteLayout from '../app/layouts/site.vue'

const { computed, inject, onBeforeUnmount, onMounted, provide, ref } = vue
Object.entries({ computed, inject, onBeforeUnmount, onMounted, provide, ref, useI18n, isNoAccess, isSignInRequired, opErrorOf, siteOrigin }).forEach(([name, fn]) => vi.stubGlobal(name, fn))
vi.stubGlobal('useRoute', () => ({ params: { site: 'restaurant' }, fullPath: '/s/restaurant/all/dishes/e1' }))
vi.stubGlobal('useConvexGinkoAssets', () => ({}))
vi.stubGlobal('useUpdateSite', () => ({ running: ref(false), run: () => {} }))
const reloadNuxtApp = vi.fn()
vi.stubGlobal('reloadNuxtApp', reloadNuxtApp)
// The browser still holds its token: the client says signed in.
vi.stubGlobal('useConvexAuth', () => ({ status: ref('authenticated') }))
// sites.meta answers what the test sets; the other queries of the layout (deletion, review count) have nothing.
const meta = { data: ref<unknown>(), error: ref<unknown>() }
vi.stubGlobal('useConvexQuery', (fn: unknown) => (String(fn) === 'sites.meta' ? meta : { data: ref(undefined), error: ref(undefined) }))
beforeEach(() => {
  meta.data.value = undefined
  meta.error.value = undefined
  reloadNuxtApp.mockClear()
})

const lastAnswer = {
  site: { slug: 'restaurant', name: 'Restaurant', url: 'https://restaurant.test', previewOrigins: [], schema: { locales: ['de'], currency: 'EUR', timeZone: 'Europe/Vienna' }, bytes: 0, entryCount: 3, lastRefreshAt: null },
  role: 'owner', grants: [],
}
const mountLayout = () => mount(SiteLayout, {
  slots: { default: '<form class="open-form">Gericht bearbeiten</form>' },
  global: {
    // Auto-imports the template uses.
    mocks: { opErrorOf },
    stubs: {
      Button: { template: '<button type="button"><slot /></button>' },
      NuxtLink: { props: ['to'], template: '<a :href="to"><slot /></a>' },
      SiteRail: true, AccountMenu: true, SiteTabBar: true, CommandPalette: true, StorageNotice: true, SiteDeleting: true,
    },
  },
})

// Wrong behaviour caught: after "sign out everywhere" on another device the page said "Bitte melde dich an. Wenn du
// hier etwas ändern sollst, frag die Inhaberin …" with only "Meine Seiten", and no way to sign in again.
test('a session ended on the server shows the signed-out page with a sign-in link back to this page', () => {
  // The session ended on the server: every query is refused for a missing identity.
  meta.error.value = normalizeConvexError(new ConvexError({ code: 'FORBIDDEN', key: 'errors.signInRequired', message: 'Bitte melde dich an.' }), { functionName: 'sites:meta' })
  const wrapper = mountLayout()
  expect(wrapper.get('[role="alert"]').text()).toBe('Du wurdest abgemeldet. Melde dich wieder an und versuche es noch einmal.Anmelden')
  expect(wrapper.get('[role="alert"] a').attributes('href')).toBe('/login?redirect=%2Fs%2Frestaurant%2Fall%2Fdishes%2Fe1')
})

// Wrong behaviour caught: (a) one timed-out load of the site data (a reconnect burst, a deploy) tore down the open
// form and told an owner to ask to be invited again; (b) a first load that failed was a dead end; (c) a member removed
// from the team kept a working page.
test.each([
  { name: 'a failure with a last answer keeps the page and the open form', error: 'timeout', data: true, alert: undefined, form: true },
  { name: 'a failure with no answer yet says so and offers to try again', error: 'timeout', data: false, alert: 'Das ließ sich nicht laden.Erneut versuchenMeine Seiten', form: false },
  { name: 'a refused access replaces the page, also with a last answer', error: 'noAccess', data: true, alert: 'Kein Zugriff auf diese Seite.Wenn du hier etwas ändern sollst, frag die Inhaberin, ob sie dich (wieder) einlädt.Meine Seiten', form: false },
])('$name', ({ error, data, alert, form }) => {
  if (data) meta.data.value = lastAnswer
  meta.error.value = error === 'timeout'
    ? normalizeConvexError(new Error('Function execution timed out'), { functionName: 'sites:meta' })
    : normalizeConvexError(new ConvexError({ code: 'FORBIDDEN', key: 'errors.noAccess', message: 'Kein Zugriff auf diese Seite.' }), { functionName: 'sites:meta' })
  const wrapper = mountLayout()
  expect(wrapper.find('[role="alert"]').exists() ? wrapper.get('[role="alert"]').text() : undefined).toBe(alert)
  expect(wrapper.find('.open-form').exists()).toBe(form)
  if (alert?.includes('Erneut versuchen')) {
    wrapper.findAll('button').find((b) => b.text() === 'Erneut versuchen')!.element.click()
    // Forced: Nuxt ignores a second reload of the same page within 10 s otherwise, so a second try did nothing.
    expect(reloadNuxtApp).toHaveBeenCalledWith({ force: true })
  }
})
