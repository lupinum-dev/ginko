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
const faq = { kind: 'collection', label: 'Häufige Fragen', fields: {}, tasks: [{ id: 'add', label: 'Frage hinzufügen', kind: 'create' }] }
vi.stubGlobal('useSiteData', async () => ({
  slug: ref('restaurant'), schema: ref({ timeZone: 'Europe/Vienna', bricks: { faq } }), site: ref({ name: 'Restaurant' }), main: ref('de'), bricks: ref([['faq', faq]]), isManager: ref(true), role: ref('owner'),
}))
const team = {
  members: [] as { id: string; email: string | null; name?: string | null; role: 'owner' | 'staff'; grants: string[]; you: boolean }[],
  keys: [] as { id: string; label: string; scopes: string[]; by: { email: string }; member: null; createdAt: number; lastUsedAt: null }[],
  invites: [{ id: 'i1', email: 'anna@example.test', role: 'staff', grants: [] as string[], expiresAt: Date.UTC(2026, 9, 22) }],
}
vi.stubGlobal('useConvexQuery', () => ({ data: ref(team), error: ref(undefined) }))
const calls: string[] = []
const sent = new Map<string, unknown>()
/** What a quick server answers, by function; `{}` for the others. */
const answers: Record<string, unknown> = { 'release.createPushKey': { id: 'k1', key: 'ginko_restaurant_abcdefghijkmnpqrstuvwxyz23456789ab' } }
/** true: mutations answer at once, as a quick server does. */
let settles = false
vi.stubGlobal('useConvexMutation', (fn: unknown) => {
  const pending = ref(false)
  return {
    pending,
    mutate: (args: unknown) => {
      calls.push(String(fn))
      sent.set(String(fn), args)
      pending.value = true
      return settles ? Promise.resolve(answers[String(fn)] ?? {}).finally(() => { pending.value = false }) : new Promise(() => {})
    },
  }
})

beforeEach(() => {
  calls.length = 0
  sent.clear()
  toasts.length = 0
  team.keys = []
  settles = false
  team.members = []
  team.invites[0]!.grants = []
})

// A row's menu renders its items in place: each item is a button that runs its action, as choosing it does.
const pass = { template: '<div><slot /></div>' }
const menu = {
  DropdownMenu: pass, DropdownMenuTrigger: pass, DropdownMenuContent: pass,
  DropdownMenuItem: { emits: ['select'], template: '<button type="button" @click="$emit(\'select\')"><slot /></button>' },
}
const mountPage = () => mount(defineComponent({ render: () => h(Suspense, null, { default: () => h(TeamPage) }) }), {
  global: { stubs: { I18nT: true, GrantsChecklist: true, SiteBackup: true, DeleteSite: true, ...menu } },
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

// Wrong behaviour caught: the row shows the name a person set, but the removal said "maria@example.test hat keinen
// Zugang mehr.", and for a member without an address "Ohne E-Mail-Adresse hat keinen Zugang mehr."
test.each([
  { email: 'maria@example.test', name: 'Maria Huber', toast: 'Maria Huber hat keinen Zugang mehr.' },
  { email: null, name: null, toast: 'Ein Mitglied hat keinen Zugang mehr.' },
])('a removed member is named as their row names them ($toast)', async ({ email, name, toast }) => {
  settles = true
  team.members = [
    { id: 'm1', email: 'wirtin@example.test', role: 'owner', grants: [], you: true },
    { id: 'm2', email, name, role: 'staff', grants: [], you: false },
  ]
  const wrapper = mountPage()
  await flushPromises()
  const row = () => wrapper.findAll('section[aria-labelledby="members-title"] > ul > li')[1]!
  await row().findAll('button').find((b) => b.text() === 'Entfernen')!.trigger('click')
  await row().findAll('button').find((b) => b.text() === 'Entfernen')!.trigger('click')
  await flushPromises()
  expect(toasts).toEqual([toast])
  wrapper.unmount()
})

// Wrong behaviour caught (onboard-8): an open invitation showed only address and role, so the owner could not check
// the rights they ticked before the person accepts.
test('an open invitation lists the rights it gives', async () => {
  team.invites[0]!.grants = ['faq.add']
  const wrapper = mountPage()
  await flushPromises()
  expect(wrapper.get('section[aria-labelledby="invites-title"] li li').text()).toBe('Häufige Fragen: Frage hinzufügen')
  wrapper.unmount()
})

// Wrong behaviour caught (admin-2): the keys section showed only with keys and offered no way to make one, so a site's
// admin could not set up the automatic publishing or a backup; and a backup key must not be able to publish.
test('a manager makes a backup-only key and sees it once', async () => {
  settles = true
  const wrapper = mountPage()
  await flushPromises()
  const keys = () => wrapper.get('section[aria-labelledby="keys-title"]')
  expect(keys().text()).toContain('Noch keine Schlüssel.')
  await keys().findAll('button').find((b) => b.text() === 'Neuer Schlüssel')!.trigger('click')
  await keys().get('#key-label').setValue('GitHub Actions')
  await keys().get('#key-purpose-export').trigger('click')
  await keys().get('form').trigger('submit')
  await flushPromises()
  expect(sent.get('release.createPushKey')).toEqual({ site: 'restaurant', label: 'GitHub Actions', scopes: ['export'] })
  expect(keys().get('pre').text()).toBe('ginko_restaurant_abcdefghijkmnpqrstuvwxyz23456789ab')
  // The form went away with its focused button: the focus moves on to copying the key, then back to "Neuer Schlüssel".
  expect(document.activeElement?.textContent?.trim()).toBe('Schlüssel kopieren')
  await keys().findAll('button').find((b) => b.text() === 'Fertig')!.trigger('click')
  await flushPromises()
  expect(keys().find('pre').exists()).toBe(false)
  expect(document.activeElement?.textContent?.trim()).toBe('Neuer Schlüssel')
  wrapper.unmount()
})
