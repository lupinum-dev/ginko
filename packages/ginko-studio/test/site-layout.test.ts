// @vitest-environment happy-dom
// The frame of every site page. The German catalog is the real one; Nuxt's auto-imports become globals, Convex is replaced.
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import * as vue from 'vue'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { ConvexError } from 'convex/values'
import { normalizeConvexError } from '@lupinum/better-convex-nuxt/errors'
import { useI18n } from '#imports'
import { isNoAccess, isSignInRequired, opErrorOf } from '../app/composables/useOps'
import { localDraftKey, writeLocalDraft } from '../app/composables/useLocalDraft'
import { readRecentSites } from '../app/composables/useRecentEntries'
import { siteOrigin } from '../app/utils/origin'
import { useBottomBar } from '../app/composables/useBottomBar'
import SiteLayout from '../app/layouts/site.vue'
import ErrorPage from '../app/error.vue'

const { computed, defineComponent, h, inject, nextTick, onBeforeUnmount, onMounted, provide, ref, watch } = vue
Object.entries({ computed, inject, nextTick, onBeforeUnmount, onMounted, provide, ref, watch, useI18n, isNoAccess, isSignInRequired, opErrorOf, siteOrigin }).forEach(([name, fn]) => vi.stubGlobal(name, fn))
// The error page reads `path`; the layout reads the rest.
const route = { params: { site: 'restaurant' }, fullPath: '/s/restaurant/all/dishes/e1', path: '/s/restaurant/all/dishes/e1' }
vi.stubGlobal('useRoute', () => route)
vi.stubGlobal('useHead', () => {})
vi.stubGlobal('useConvexGinkoAssets', () => ({}))
vi.stubGlobal('useUpdateSite', () => ({ running: ref(false), run: () => {} }))
const reloadNuxtApp = vi.fn()
vi.stubGlobal('reloadNuxtApp', reloadNuxtApp)
// The browser still holds its token: the client says signed in.
const user = ref<{ id: string }>()
vi.stubGlobal('useConvexAuth', () => ({ status: ref('authenticated'), user }))
// sites.meta answers what the test sets; the other queries of the layout (deletion, review count) have nothing.
const meta = { data: ref<unknown>(), error: ref<unknown>() }
vi.stubGlobal('useConvexQuery', (fn: unknown) => (String(fn) === 'sites.meta' ? meta : { data: ref(undefined), error: ref(undefined) }))
// Every layout shares the answer above, so the last test's layout must not react to the next test's.
enableAutoUnmount(afterEach)
beforeEach(() => {
  meta.data.value = undefined
  meta.error.value = undefined
  reloadNuxtApp.mockClear()
  localStorage.clear()
  user.value = { id: 'u1' }
})

const lastAnswer = {
  site: { slug: 'restaurant', name: 'Restaurant', url: 'https://restaurant.test', previewOrigins: [], schema: { locales: ['de'], currency: 'EUR', timeZone: 'Europe/Vienna' }, bytes: 0, entryCount: 3, lastRefreshAt: null },
  role: 'owner', grants: [],
}
const noAccess = () => normalizeConvexError(new ConvexError({ code: 'FORBIDDEN', key: 'errors.noAccess', message: 'Kein Zugriff auf diese Seite.' }), { functionName: 'sites:meta' })
const mountLayout = (page: unknown = '<form class="open-form">Gericht bearbeiten</form>') => mount(SiteLayout, {
  slots: { default: page as string },
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
    : noAccess()
  const wrapper = mountLayout()
  expect(wrapper.find('[role="alert"]').exists() ? wrapper.get('[role="alert"]').text() : undefined).toBe(alert)
  expect(wrapper.find('.open-form').exists()).toBe(form)
  if (alert?.includes('Erneut versuchen')) {
    wrapper.findAll('button').find((b) => b.text() === 'Erneut versuchen')!.element.click()
    // Forced: Nuxt ignores a second reload of the same page within 10 s otherwise, so a second try did nothing.
    expect(reloadNuxtApp).toHaveBeenCalledWith({ force: true })
  }
})

// Wrong behaviour caught: a member removed while typing saw only "Kein Zugriff auf diese Seite." and could not know
// whether her text went online or that this browser keeps it; or a person with nothing left here was promised it back.
test.each([
  { name: 'input of this site left behind: the page says it is not online and comes back', site: 'restaurant', note: true },
  { name: 'input only of another site: no promise', site: 'garden', note: false },
])('removed from the team while a form is open, $name', async ({ site, note }) => {
  meta.data.value = lastAnswer
  // The open form writes its copy as it closes, in the same render that shows the access page.
  const OpenForm = defineComponent({
    setup() {
      onBeforeUnmount(() => writeLocalDraft(localDraftKey(site, 'u1', 'e1'), { v: 1, savedAt: Date.now(), baseRev: 3, locale: 'de', fields: { name: 'Kalbsschnitzel' } }))
      return () => h('form', { class: 'open-form' })
    },
  })
  const wrapper = mountLayout(OpenForm)
  meta.error.value = noAccess()
  await flushPromises()
  expect(wrapper.find('.open-form').exists()).toBe(false)
  expect(wrapper.get('[role="alert"]').text()).toBe([
    'Kein Zugriff auf diese Seite.',
    ...(note ? ['Was du hier noch nicht gespeichert hattest, ist nicht auf der Website. Wirst du wieder eingeladen, bekommst du es in diesem Browser zurück.'] : []),
    'Wenn du hier etwas ändern sollst, frag die Inhaberin, ob sie dich (wieder) einlädt.Meine Seiten',
  ].join(''))
})

// Wrong behaviour caught: a page that opened without access while the person was still loading never showed the
// note, though this browser kept her input for the site.
test('opened without access before the person is known: the note shows once she is', async () => {
  user.value = undefined
  writeLocalDraft(localDraftKey('restaurant', 'u1', 'e1'), { v: 1, savedAt: Date.now(), baseRev: 3, locale: 'de', fields: { name: 'Kalbsschnitzel' } })
  meta.error.value = noAccess()
  const wrapper = mountLayout()
  await flushPromises()
  const note = 'Was du hier noch nicht gespeichert hattest'
  expect(wrapper.get('[role="alert"]').text()).not.toContain(note)
  user.value = { id: 'u1' }
  await flushPromises()
  expect(wrapper.get('[role="alert"]').text()).toContain(note)
})

// Wrong behaviour caught: a mistyped address, an unknown site or one the person was removed from went into "Zuletzt
// geöffnet" before the site answered, and pushed real sites out of its three places.
test.each([
  { name: 'a site that opens goes first once it has answered', answer: () => { meta.data.value = lastAnswer }, recent: ['restaurant', 'garden', 'saas'] },
  { name: 'a refused site is not remembered', answer: () => { meta.error.value = noAccess() }, recent: ['garden', 'saas', 'docs'] },
])('Zuletzt geöffnet: $name', async ({ answer, recent }) => {
  localStorage.setItem('ginko:recent-sites', JSON.stringify(['garden', 'saas', 'docs']))
  mountLayout()
  await flushPromises()
  expect(readRecentSites()).toEqual(['garden', 'saas', 'docs'])
  answer()
  await flushPromises()
  expect(readRecentSites()).toEqual(recent)
})

// Wrong behaviour caught: the phone tab bar lay over the entry editor's save bar, or stayed away after the editor closed.
test('the phone tab bar gives way while the entry editor\'s save bar is open', async () => {
  meta.data.value = lastAnswer
  const wrapper = mountLayout()
  const tabs = () => wrapper.find('site-tab-bar-stub').exists()
  expect(tabs()).toBe(true)
  useBottomBar().value = 72
  await nextTick()
  expect(tabs()).toBe(false)
  useBottomBar().value = 0
  await nextTick()
  expect(tabs()).toBe(true)
})

// Wrong behaviour caught: a wrong or old Studio address showed Nuxt's English "Page not found" with no Studio frame and
// no way back to the site.
test.each([
  { name: 'an unknown address under a site leads back to its start page', status: 404, path: '/s/restaurant/settings', text: 'Diese Adresse gibt es im Studio nicht.Vielleicht ist der Link alt oder hat einen Tippfehler.HeuteMeine Seiten', links: ['/s/restaurant', '/?all'] },
  { name: 'a failure outside a site offers to reload', status: 500, path: '/', text: 'Hier ist etwas schiefgelaufen.Lade die Seite neu. Was du gespeichert hast, ist nicht verloren.Neu ladenMeine Seiten', links: ['/?all'] },
])('the error page: $name', async ({ status, path, text, links }) => {
  const before = route.path
  route.path = path
  try {
    const wrapper = mount(ErrorPage, {
      props: { error: { status, statusCode: status } as never },
      global: { stubs: { NuxtLayout: { template: '<div><slot /></div>' }, Button: { template: '<button type="button"><slot /></button>' }, NuxtLink: { props: ['to'], template: '<a :href="to"><slot /></a>' } } },
    })
    expect(wrapper.get('main').text()).toBe(text)
    expect(wrapper.findAll('a').map((a) => a.attributes('href'))).toEqual(links)
    if (status !== 404) {
      await wrapper.get('button').trigger('click')
      expect(reloadNuxtApp).toHaveBeenCalledWith({ force: true })
    }
  } finally {
    route.path = before
  }
})
