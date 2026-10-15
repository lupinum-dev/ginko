// @vitest-environment happy-dom
// The team page with one open invitation. The German catalog is the real one; Nuxt's auto-imports become globals,
// and Convex is replaced: a mutation stays pending until the test ends, like a slow server.
import { flushPromises, mount } from '@vue/test-utils'
import * as vue from 'vue'
import { expect, test, vi } from 'vitest'
import { useI18n } from '#imports'
import TeamPage from '../app/pages/s/[site]/team/index.vue'

const { computed, defineComponent, h, reactive, ref, Suspense } = vue
Object.entries({ computed, reactive, ref, useI18n }).forEach(([name, fn]) => vi.stubGlobal(name, fn))

vi.stubGlobal('definePageMeta', () => {})
vi.stubGlobal('useHead', () => {})
vi.stubGlobal('useToast', () => ({ show: () => {} }))
vi.stubGlobal('useSiteData', async () => ({
  slug: ref('restaurant'), schema: ref({ timeZone: 'Europe/Vienna' }), site: ref({ name: 'Restaurant' }), main: ref('de'), bricks: ref([]), isManager: ref(true), role: ref('owner'),
}))
const team = { members: [], keys: [], invites: [{ id: 'i1', email: 'anna@example.test', role: 'staff', expiresAt: Date.UTC(2026, 9, 22) }] }
vi.stubGlobal('useConvexQuery', () => ({ data: ref(team), error: ref(undefined) }))
const calls: string[] = []
vi.stubGlobal('useConvexMutation', (fn: unknown) => {
  const pending = ref(false)
  return { pending, mutate: () => { calls.push(String(fn)); pending.value = true; return new Promise(() => {}) } }
})

// Wrong behaviour caught: a double click on "Einladung zurückziehen" sent the revoke twice; the second call found
// no invitation and showed an error although the first one worked.
test('revoking an invitation sends one call, also on a double click', async () => {
  const wrapper = mount(defineComponent({ render: () => h(Suspense, null, { default: () => h(TeamPage) }) }), {
    global: { stubs: { I18nT: true, GrantsChecklist: true } },
  })
  await flushPromises()
  const revoke = wrapper.find('section[aria-labelledby="invites-title"] button')
  await revoke.trigger('click')
  await revoke.trigger('click')
  expect(calls).toEqual(['invites.revoke'])
})
