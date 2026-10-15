// @vitest-environment happy-dom
// "Meine Seiten": open invitations, and an agency's many sites. The German catalog is the real one; Nuxt's auto-imports
// become globals, and Convex is replaced.
import { flushPromises, mount } from '@vue/test-utils'
import * as vue from 'vue'
import { expect, test, vi } from 'vitest'
import { useI18n } from '#imports'
import SitesPage from '../app/pages/index.vue'

const { computed, defineComponent, h, onMounted, reactive, ref, Suspense, watch, watchEffect } = vue
Object.entries({ computed, onMounted, reactive, ref, watch, watchEffect, useI18n }).forEach(([name, fn]) => vi.stubGlobal(name, fn))
vi.stubGlobal('useToast', () => ({ show: () => {} }))

vi.stubGlobal('definePageMeta', () => {})
vi.stubGlobal('useHead', () => {})
vi.stubGlobal('navigateTo', async () => {})
vi.stubGlobal('useRoute', () => ({ query: {} }))
vi.stubGlobal('useLocalePicker', () => ({ locale: ref('de'), locales: [], pick: async () => {} }))
vi.stubGlobal('localeLabel', () => '')
const invites = [{ invite: 'i1', site: 'Gasthaus zur Linde', role: 'staff' }, { invite: 'i2', site: 'Gartenwirtschaft', role: 'staff' }]
/** What each query answers; the tests set `sites.mine`. */
const settings = ref<{ name?: string; remindByMail: boolean }>({ remindByMail: true })
const answers: Record<string, unknown> = { 'invites.mine': invites, 'sites.mine': [], 'account.settings': settings }
vi.stubGlobal('useConvexQuery', (fn: unknown) => ({ data: vue.isRef(answers[String(fn)]) ? answers[String(fn)] : ref(answers[String(fn)]), error: ref(undefined) }))
// Each acceptance runs until the test ends it; the first one fails. A name is saved at once, and the live settings follow.
const finish = new Map<string, (ok: boolean) => void>()
vi.stubGlobal('useConvexMutation', (fn: unknown) => ({
  mutate: String(fn) === 'account.setName'
    ? async ({ name }: { name: string }) => { settings.value = { ...settings.value, name } }
    : (args: { invite?: string }) => new Promise((resolve, reject) => finish.set(args.invite!, (ok) => (ok ? resolve({ site: 'linde' }) : reject(new Error('lost'))))),
  pending: ref(false),
}))
vi.stubGlobal('opErrorOf', () => ({ code: 'UNKNOWN', message: 'Das hat nicht geklappt.' }))

const mountPage = () => mount(defineComponent({ render: () => h(Suspense, null, { default: () => h(SitesPage) }) }), {
  global: { stubs: { I18nT: true, NuxtLink: { props: ['to'], template: '<a :href="to"><slot /></a>' }, Switch: true, DeleteAccount: true, SignOut: true } },
})

// Wrong behaviour caught: accepting one invitation, then another, re-enabled the second's button when the first
// failed, so a second click accepted it twice.
test('an invitation\'s "Annehmen" stays disabled while it is accepted, also when another one fails first', async () => {
  const wrapper = mountPage()
  await flushPromises()
  const buttons = () => wrapper.findAll('li button')
  await buttons()[0]!.trigger('click')
  await buttons()[1]!.trigger('click')
  finish.get('i1')!(false)
  await flushPromises()
  expect(buttons().map((b) => b.attributes('disabled') !== undefined)).toEqual([false, true])
})

// Wrong behaviour caught: an agency scanned two dozen sites in creation order, with no search, nothing it opened last
// near the top, no address to tell two sites apart, "Admin" on every row, and a site being deleted looking like the others.
test('many sites: by name with their address, the last opened first, and a search', async () => {
  const site = (slug: string, name: string, deleting = false) => ({ slug, name, url: `https://${slug}.at`, role: 'admin', deleting })
  answers['sites.mine'] = [
    site('zahnarzt-huber', 'Zahnarzt Huber'), site('linde', 'Gasthaus zur Linde'), site('aerzte', 'Ärztezentrum Nord'), site('mayr', 'Bäckerei Mayr'),
    site('pichler', 'Weingut Pichler'), site('central', 'Café Central'), site('lupinum', 'Lupinum'), site('yoga', 'Yoga Studio'), site('post', 'Hotel Post', true),
  ]
  localStorage.setItem('ginko:recent-sites', JSON.stringify(['linde', 'gone']))
  try {
    const wrapper = mountPage()
    await flushPromises()
    const groups = () => wrapper.findAll('section').map((g) => [g.find('h2').exists() ? g.get('h2').text() : '', ...g.findAll('li').map((li) => li.text())])
    expect(groups()).toEqual([
      ['Zuletzt geöffnet', 'Gasthaus zur Lindelinde.at'],
      ['Alle Seiten', 'Ärztezentrum Nordaerzte.at', 'Bäckerei Mayrmayr.at', 'Café Centralcentral.at', 'Gasthaus zur Lindelinde.at', 'Hotel Postpost.atWird gelöscht',
        'Lupinumlupinum.at', 'Weingut Pichlerpichler.at', 'Yoga Studioyoga.at', 'Zahnarzt Huberzahnarzt-huber.at'],
    ])

    await wrapper.get('input[type="search"]').setValue('gast')
    expect(groups()).toEqual([['', 'Gasthaus zur Lindelinde.at']])
    await wrapper.get('input[type="search"]').setValue('xyz')
    expect(wrapper.get('[role="status"]').text()).toBe('Keine Seite passt zu „xyz“.')
  } finally {
    answers['sites.mine'] = []
    localStorage.clear()
  }
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
  const wrapper = mount(defineComponent({ render: () => h(Suspense, null, { default: () => h(SitesPage) }) }), {
    global: { stubs: { I18nT: true, NuxtLink: true, Switch: true, DeleteAccount: true, SignOut: true } },
    attachTo: document.body,
  })
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
