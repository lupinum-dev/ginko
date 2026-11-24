// @vitest-environment happy-dom
// "Website verbinden" (`ginko connect`): the person types the code from the terminal, sees which folder asks, picks a
// site and confirms or declines. The German catalog is the real one; Nuxt's auto-imports become globals, and Convex is
// replaced by answers per function.
import { flushPromises, mount } from '@vue/test-utils'
import * as vue from 'vue'
import { beforeEach, expect, test, vi } from 'vitest'
import { useI18n } from '#imports'
import ConnectPage from '../app/pages/connect.vue'

const { computed, defineComponent, h, ref, Suspense, watch } = vue
Object.entries({ computed, ref, watch, useI18n }).forEach(([name, fn]) => vi.stubGlobal(name, fn))
vi.stubGlobal('definePageMeta', () => {})
vi.stubGlobal('useHead', () => {})
vi.stubGlobal('opErrorOf', (e: unknown) => e)

type Site = { slug: string; name: string; role: 'admin' | 'owner' | 'staff'; deleting: boolean }
let sites: Site[] = []
vi.stubGlobal('useConvexQuery', () => ({ data: ref(sites), error: ref(undefined) }))
/** Every call as `function name` and its arguments; answers per function name. */
const calls: [string, unknown][] = []
let answers: Record<string, unknown> = {}
vi.stubGlobal('useConvexMutation', (fn: unknown) => ({
  pending: ref(false),
  mutate: async (args: unknown) => {
    calls.push([String(fn), args])
    return answers[String(fn)]
  },
}))

beforeEach(() => {
  calls.length = 0
  sites = [
    { slug: 'linde', name: 'Gasthaus Linde', role: 'owner', deleting: false },
    { slug: 'post', name: 'Hotel Post', role: 'staff', deleting: false },
    { slug: 'alt', name: 'Alte Seite', role: 'owner', deleting: true },
  ]
  answers = {
    'connect.lookup': { ok: true, label: 'linde-website', startedAt: Date.now() - 3 * 60_000 - 5_000 },
    'connect.approve': { ok: true },
    'connect.decline': { ok: true },
  }
})

async function mountPage() {
  const wrapper = mount(defineComponent({ render: () => h(Suspense, null, { default: () => h(ConnectPage) }) }), { attachTo: document.body })
  await flushPromises()
  return wrapper
}

// Wrong behaviour caught: a link with the code in it confirms for the person (the page takes the code from the
// address), a half-typed code is sent and counted as a wrong code, the person confirms without seeing which folder
// asks or that the key can also back up (read) the content, or a site they only work on as staff is offered.
test('the typed code shows the asking folder, and Connect sends that code with a site the person manages', async () => {
  const wrapper = await mountPage()
  expect((wrapper.get('#connect-code').element as HTMLInputElement).value).toBe('')
  expect(wrapper.find('button').exists()).toBe(false)

  await wrapper.get('#connect-code').setValue('abcd-ef')
  await flushPromises()
  expect(calls).toEqual([])

  await wrapper.get('#connect-code').setValue('abcd-efgh')
  await flushPromises()
  expect(calls).toEqual([['connect.lookup', { code: 'ABCDEFGH' }]])
  expect(wrapper.text()).toContain('Anfrage von „linde-website“, gestartet vor 3 Minuten.')
  expect(wrapper.findAll('#connect-site option').map((o) => o.text())).toEqual(['Gasthaus Linde'])
  expect((wrapper.get('#connect-site').element as HTMLSelectElement).value).toBe('linde')
  expect(wrapper.text()).toContain('Der Schlüssel kann die Inhaltsstruktur dieser Seite veröffentlichen und ihre Inhalte sichern, wie ein Schlüssel „Veröffentlichen und sichern“. Du kannst ihn auf der Seite Team widerrufen.')

  await wrapper.get('form').trigger('submit')
  await flushPromises()
  expect(calls.at(-1)).toEqual(['connect.approve', { code: 'ABCDEFGH', site: 'linde' }])
  expect(wrapper.get('[role="status"]').text()).toBe('Verbunden. Geh zurück zum Terminal.')
  expect(wrapper.find('form').exists()).toBe(false)
  wrapper.unmount()
})

// Wrong behaviour caught: a wrong or blocked code still offers Connect, or the two refusals read the same, so the person
// keeps guessing while blocked.
test('a wrong code and a blocked person each get their sentence and no buttons', async () => {
  answers['connect.lookup'] = { ok: false, reason: 'invalid' }
  const wrapper = await mountPage()
  await wrapper.get('#connect-code').setValue('AAAAAAAA')
  await flushPromises()
  expect(wrapper.get('[role="alert"]').text()).toBe('Dieser Code ist nicht gültig. Starte im Terminal neu.')
  expect(wrapper.find('button').exists()).toBe(false)

  answers['connect.lookup'] = { ok: false, reason: 'limited' }
  await wrapper.get('#connect-code').setValue('AAAAAAA2')
  await flushPromises()
  expect(wrapper.get('[role="alert"]').text()).toBe('Zu viele falsche Codes. Warte 10 Minuten und versuche es dann noch einmal.')
  expect(wrapper.find('#connect-site').exists()).toBe(false)
  wrapper.unmount()
})

// Wrong behaviour caught: Decline does nothing on the server, so the computer keeps waiting for an approval.
test('Decline ends the request on the server and says so', async () => {
  const wrapper = await mountPage()
  await wrapper.get('#connect-code').setValue('ABCDEFGH')
  await flushPromises()
  await wrapper.findAll('button').find((b) => b.text() === 'Ablehnen')!.trigger('click')
  await flushPromises()
  expect(calls.at(-1)).toEqual(['connect.decline', { code: 'ABCDEFGH' }])
  expect(wrapper.get('[role="status"]').text()).toBe('Abgelehnt. Der Computer bekommt keinen Schlüssel.')
  wrapper.unmount()
})

// Wrong behaviour caught: a staff member types the code and only learns at the end that they may not connect.
test('a person who manages no site gets one sentence instead of the form', async () => {
  sites = [{ slug: 'post', name: 'Hotel Post', role: 'staff', deleting: false }]
  const wrapper = await mountPage()
  expect(wrapper.find('form').exists()).toBe(false)
  expect(wrapper.text()).toContain('Du verwaltest keine Seite, darum kannst du keine Website verbinden.')
  wrapper.unmount()
})
