// @vitest-environment happy-dom
// The frame of every site page. The German catalog is the real one; Nuxt's auto-imports become globals, Convex is replaced.
import { mount } from '@vue/test-utils'
import * as vue from 'vue'
import { expect, test, vi } from 'vitest'
import { ConvexError } from 'convex/values'
import { normalizeConvexError } from '@lupinum/better-convex-nuxt/errors'
import { useI18n } from '#imports'
import { isSignInRequired, opErrorOf } from '../app/composables/useOps'
import SiteLayout from '../app/layouts/site.vue'

const { computed, inject, onBeforeUnmount, onMounted, provide, ref } = vue
Object.entries({ computed, inject, onBeforeUnmount, onMounted, provide, ref, useI18n, isSignInRequired, opErrorOf }).forEach(([name, fn]) => vi.stubGlobal(name, fn))
vi.stubGlobal('useRoute', () => ({ params: { site: 'restaurant' }, fullPath: '/s/restaurant/all/dishes/e1' }))
vi.stubGlobal('useConvexGinkoAssets', () => ({}))
vi.stubGlobal('useUpdateSite', () => ({ running: ref(false), run: () => {} }))
// The browser still holds its token: the client says signed in.
vi.stubGlobal('useConvexAuth', () => ({ status: ref('authenticated') }))
// The session ended on the server (signed out everywhere): every query is refused for a missing identity.
const refused = normalizeConvexError(new ConvexError({ code: 'FORBIDDEN', key: 'errors.signInRequired', message: 'Bitte melde dich an.' }), { functionName: 'sites:meta' })
vi.stubGlobal('useConvexQuery', () => ({ data: ref(undefined), error: ref(refused) }))

// Wrong behaviour caught: after "sign out everywhere" on another device the page said "Bitte melde dich an. Wenn du
// hier etwas ändern sollst, frag die Inhaberin …" with only "Meine Seiten", and no way to sign in again.
test('a session ended on the server shows the signed-out page with a sign-in link back to this page', () => {
  const wrapper = mount(SiteLayout, {
    global: {
      stubs: {
        Button: { template: '<div><slot /></div>' },
        NuxtLink: { props: ['to'], template: '<a :href="to"><slot /></a>' },
        SiteRail: true, AccountMenu: true, SiteTabBar: true, CommandPalette: true, StorageNotice: true, SiteDeleting: true,
      },
    },
  })
  expect(wrapper.get('[role="alert"]').text()).toBe('Du wurdest abgemeldet. Melde dich wieder an und versuche es noch einmal.Anmelden')
  expect(wrapper.get('[role="alert"] a').attributes('href')).toBe('/login?redirect=%2Fs%2Frestaurant%2Fall%2Fdishes%2Fe1')
})
