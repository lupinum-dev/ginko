// @vitest-environment happy-dom
// "Meine Seiten" with two open invitations. The German catalog is the real one; Nuxt's auto-imports become globals,
// and Convex is replaced.
import { flushPromises, mount } from '@vue/test-utils'
import * as vue from 'vue'
import { expect, test, vi } from 'vitest'
import { useI18n } from '#imports'
import SitesPage from '../app/pages/index.vue'

const { computed, defineComponent, h, reactive, ref, Suspense, watch, watchEffect } = vue
Object.entries({ computed, reactive, ref, watch, watchEffect, useI18n }).forEach(([name, fn]) => vi.stubGlobal(name, fn))
vi.stubGlobal('useToast', () => ({ show: () => {} }))

vi.stubGlobal('definePageMeta', () => {})
vi.stubGlobal('useHead', () => {})
vi.stubGlobal('navigateTo', async () => {})
vi.stubGlobal('useRoute', () => ({ query: {} }))
vi.stubGlobal('useLocalePicker', () => ({ locale: ref('de'), locales: [], pick: async () => {} }))
vi.stubGlobal('localeLabel', () => '')
const invites = [{ invite: 'i1', site: 'Gasthaus zur Linde', role: 'staff' }, { invite: 'i2', site: 'Gartenwirtschaft', role: 'staff' }]
vi.stubGlobal('useConvexQuery', (fn: unknown) => ({ data: ref(String(fn) === 'invites.mine' ? invites : String(fn) === 'sites.mine' ? [] : undefined), error: ref(undefined) }))
// Each acceptance runs until the test ends it; the first one fails.
const finish = new Map<string, (ok: boolean) => void>()
vi.stubGlobal('useConvexMutation', () => ({
  mutate: (args: { invite?: string }) => new Promise((resolve, reject) => finish.set(args.invite!, (ok) => (ok ? resolve({ site: 'linde' }) : reject(new Error('lost'))))),
}))
vi.stubGlobal('opErrorOf', () => ({ code: 'UNKNOWN', message: 'Das hat nicht geklappt.' }))

// Wrong behaviour caught: accepting one invitation, then another, re-enabled the second's button when the first
// failed, so a second click accepted it twice.
test('an invitation\'s "Annehmen" stays disabled while it is accepted, also when another one fails first', async () => {
  const wrapper = mount(defineComponent({ render: () => h(Suspense, null, { default: () => h(SitesPage) }) }), {
    global: { stubs: { I18nT: true, NuxtLink: true, Switch: true, DeleteAccount: true, SignOut: true } },
  })
  await flushPromises()
  const buttons = () => wrapper.findAll('li button')
  await buttons()[0]!.trigger('click')
  await buttons()[1]!.trigger('click')
  finish.get('i1')!(false)
  await flushPromises()
  expect(buttons().map((b) => b.attributes('disabled') !== undefined)).toEqual([false, true])
})
