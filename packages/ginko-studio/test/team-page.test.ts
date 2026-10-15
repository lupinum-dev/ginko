// @vitest-environment happy-dom
// The team page with one open invitation. The German catalog is the real one; Nuxt's auto-imports become globals,
// and Convex is replaced: a mutation stays pending until the test ends, like a slow server, unless a test settles it.
import { flushPromises, mount } from '@vue/test-utils'
import * as vue from 'vue'
import { beforeEach, expect, test, vi } from 'vitest'
import { useI18n } from '#imports'
import TeamPage from '../app/pages/s/[site]/team/index.vue'

const { computed, defineComponent, h, nextTick, reactive, ref, Suspense } = vue
Object.entries({ computed, nextTick, reactive, ref, useI18n }).forEach(([name, fn]) => vi.stubGlobal(name, fn))

vi.stubGlobal('definePageMeta', () => {})
vi.stubGlobal('useHead', () => {})
const toasts: string[] = []
vi.stubGlobal('useToast', () => ({ show: (text: string) => toasts.push(text) }))
vi.stubGlobal('useSiteData', async () => ({
  slug: ref('restaurant'), schema: ref({ timeZone: 'Europe/Vienna' }), site: ref({ name: 'Restaurant' }), main: ref('de'), bricks: ref([]), isManager: ref(true), role: ref('owner'),
}))
const team = {
  members: [] as { id: string; email: string; role: 'owner' | 'staff'; grants: string[]; you: boolean }[],
  keys: [],
  invites: [{ id: 'i1', email: 'anna@example.test', role: 'staff', grants: [] as string[], expiresAt: Date.UTC(2026, 9, 22) }],
}
vi.stubGlobal('useConvexQuery', () => ({ data: ref(team), error: ref(undefined) }))
const calls: string[] = []
/** true: mutations answer at once, as a quick server does. */
let settles = false
vi.stubGlobal('useConvexMutation', (fn: unknown) => {
  const pending = ref(false)
  return { pending, mutate: () => { calls.push(String(fn)); pending.value = true; return settles ? Promise.resolve({}).finally(() => { pending.value = false }) : new Promise(() => {}) } }
})

beforeEach(() => {
  calls.length = 0
  toasts.length = 0
  settles = false
  team.members = []
})

const mountPage = () => mount(defineComponent({ render: () => h(Suspense, null, { default: () => h(TeamPage) }) }), {
  global: { stubs: { I18nT: true, GrantsChecklist: true, DeleteSite: true } },
  attachTo: document.body,
})

// Wrong behaviour caught: a double click on "Einladung zurückziehen" sent the revoke twice; the second call found
// no invitation and showed an error although the first one worked.
test('revoking an invitation sends one call, also on a double click', async () => {
  const wrapper = mountPage()
  await flushPromises()
  const revoke = wrapper.find('section[aria-labelledby="invites-title"] button')
  await revoke.trigger('click')
  await revoke.trigger('click')
  expect(calls).toEqual(['invites.revoke'])
  wrapper.unmount()
})

// Wrong behaviour caught (admin-11): after "Zurückziehen" nothing said it worked, and the focus fell to the page body
// with the row it was on.
test('a revoked invitation is confirmed and the focus moves to "Einladen"', async () => {
  settles = true
  const wrapper = mountPage()
  await flushPromises()
  await wrapper.find('section[aria-labelledby="invites-title"] button').trigger('click')
  await flushPromises()
  expect(toasts).toEqual(['Einladung an anna@example.test zurückgezogen.'])
  expect(document.activeElement?.textContent?.trim()).toBe('Einladen')
  wrapper.unmount()
})

// Wrong behaviour caught (A17): the signed-in owner's own row offered "Entfernen" and looked like everyone else's,
// so an owner could lock themselves out by mistake.
test('the own row is marked "Du" and offers no removal', async () => {
  team.members = [
    { id: 'm1', email: 'wirtin@example.test', role: 'owner', grants: [], you: true },
    { id: 'm2', email: 'chef@example.test', role: 'owner', grants: [], you: false },
  ]
  const wrapper = mountPage()
  await flushPromises()
  const [own, other] = wrapper.findAll('section[aria-labelledby="members-title"] > ul > li')
  expect(own!.text()).toContain('Du')
  expect(own!.findAll('button').map((b) => b.text())).not.toContain('Entfernen')
  expect(other!.findAll('button').map((b) => b.text())).toContain('Entfernen')
  wrapper.unmount()
})
