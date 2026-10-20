// @vitest-environment happy-dom
// Account settings: the person's name and the reminder mail. The German catalog is the real one; Nuxt's auto-imports
// become globals, and Convex is replaced.
import { flushPromises, mount } from '@vue/test-utils'
import * as vue from 'vue'
import { expect, test, vi } from 'vitest'
import { useI18n } from '#imports'
import AccountPage from '../app/pages/account.vue'

const { computed, defineComponent, h, ref, Suspense, watch } = vue
Object.entries({ computed, ref, watch, useI18n }).forEach(([name, fn]) => vi.stubGlobal(name, fn))
vi.stubGlobal('useToast', () => ({ show: () => {} }))
vi.stubGlobal('definePageMeta', () => {})
vi.stubGlobal('useHead', () => {})
vi.stubGlobal('navigateTo', async () => {})
vi.stubGlobal('useConvexAuth', () => ({ user: ref({ id: 'u1', email: 'anna@example.test' }), client: {} }))
vi.stubGlobal('useLocalePicker', () => ({ locale: ref('de'), locales: [], pick: async () => {} }))
vi.stubGlobal('localeLabel', () => '')
vi.stubGlobal('opErrorOf', () => ({ code: 'UNKNOWN', message: 'Das hat nicht geklappt.' }))
/** What each query answers; the tests set `sites.mine`. */
const settings = ref<{ name?: string; remindByMail: boolean }>({ remindByMail: true })
const answers: Record<string, unknown> = { 'sites.mine': [], 'account.settings': settings }
vi.stubGlobal('useConvexQuery', (fn: unknown) => ({ data: vue.isRef(answers[String(fn)]) ? answers[String(fn)] : ref(answers[String(fn)]), error: ref(undefined) }))
// A name is saved at once, and the live settings follow.
vi.stubGlobal('useConvexMutation', (fn: unknown) => ({
  mutate: async (args: { name?: string }) => { if (String(fn) === 'account.setName') settings.value = { ...settings.value, name: args.name } },
  pending: ref(false),
}))

const mountPage = (options: Parameters<typeof mount>[1] = {}) => mount(defineComponent({ render: () => h(Suspense, null, { default: () => h(AccountPage) }) }), {
  global: { stubs: { NuxtLink: true, Switch: true, DeleteAccount: true } },
  ...options,
})

// Wrong behaviour caught: every account was offered a reminder mail "zum Beispiel das Mittagsmenü", also where no site
// can ever send one (an agency site has no weekly task).
test.each([
  { weekly: false, text: undefined },
  { weekly: true, text: 'Erinnerungen per E-MailAm Abend vor Wochenbeginn eine kurze Mail, wenn für die nächste Woche noch etwas fehlt.' },
])('the reminder switch shows only where a site can send the mail (weekly: $weekly)', async ({ weekly, text }) => {
  answers['sites.mine'] = [{ slug: 'lupinum', name: 'Lupinum', url: 'https://lupinum.at', role: 'owner', deleting: false, weekly }]
  answers['account.settings'] = { remindByMail: true }
  try {
    const wrapper = mountPage()
    await flushPromises()
    const label = wrapper.find('label[for="remind"]')
    expect(label.exists() ? label.text() : undefined).toBe(text)
  } finally {
    answers['sites.mine'] = []
    answers['account.settings'] = settings
  }
})

// Wrong behaviour caught: after "Speichern" the button goes away with the focus on it, and the focus fell to the page body.
test('a saved name keeps the focus in the name field', async () => {
  const wrapper = mountPage({ attachTo: document.body })
  await flushPromises()
  await wrapper.get('#own-name').setValue('Anna Berger')
  const save = wrapper.findAll('button').find((b) => b.text() === 'Speichern')!
  ;(save.element as HTMLButtonElement).focus()
  await save.trigger('click')
  await flushPromises()
  expect(wrapper.findAll('button').some((b) => b.text() === 'Speichern')).toBe(false)
  expect(document.activeElement?.id).toBe('own-name')
  wrapper.unmount()
})
