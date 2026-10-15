// @vitest-environment happy-dom
// The account menu: signing out here, and signing out the person's other devices. The German catalog and the browser
// storage (happy-dom's localStorage) are real; the auth client, the toast, navigation and the dropdown are replaced.
import { mount } from '@vue/test-utils'
import * as vue from 'vue'
import { beforeEach, expect, test, vi } from 'vitest'
import { useI18n } from '#imports'
import { localDraftKey, writeLocalDraft } from '../app/composables/useLocalDraft'
import AccountMenu from '../app/components/AccountMenu.vue'

const { computed, ref } = vue
Object.entries({ computed, ref, useI18n }).forEach(([name, fn]) => vi.stubGlobal(name, fn))
const client = { signOut: vi.fn(), revokeOtherSessions: vi.fn(), revokeSessions: vi.fn() }
vi.stubGlobal('useConvexAuth', () => ({ client, user: ref({ id: 'u1', email: 'koch@example.com' }) }))
const toasts: [string, unknown][] = []
vi.stubGlobal('useToast', () => ({ show: (text: string, opts?: unknown) => toasts.push([text, opts]) }))
const navigateTo = vi.fn()
vi.stubGlobal('navigateTo', navigateTo)

beforeEach(() => {
  vi.clearAllMocks()
  client.signOut.mockResolvedValue({ data: { success: true }, error: null })
  client.revokeOtherSessions.mockResolvedValue({ data: { status: true }, error: null })
  toasts.length = 0
  localStorage.clear()
})

const item = { props: ['disabled'], emits: ['select'], template: '<button type="button" :disabled="disabled" @click="$emit(\'select\')"><slot /></button>' }
const slot = { template: '<div><slot /></div>' }
const mountMenu = () => mount(AccountMenu, {
  props: { manager: false, updating: false },
  global: { stubs: { DropdownMenu: slot, DropdownMenuTrigger: slot, DropdownMenuContent: slot, DropdownMenuLabel: slot, DropdownMenuSeparator: true, DropdownMenuItem: item, NuxtLink: true } },
})
const click = async (wrapper: ReturnType<typeof mountMenu>, text: string) => {
  await wrapper.findAll('button').find((b) => b.text() === text)!.trigger('click')
  await vue.nextTick()
  await new Promise((resolve) => setTimeout(resolve))
}
const copy = { v: 1 as const, savedAt: Date.now(), baseRev: 3, locale: 'de', fields: { name: 'Kalbsschnitzel' } }

// Wrong behaviour caught: Abmelden silently deleted the unsaved input of a form open in another tab; or it asked every
// time, also with nothing unsaved, which teaches people to click OK; or a refused sign-out (Better Auth answers with
// `error`, it does not throw) still deleted the input and left for the sign-in page while the session stayed alive.
test.each([
  { name: 'nothing unsaved: no question, signed out', mine: false, answer: true, refused: false, asked: false, called: true, done: true },
  { name: 'unsaved input and Abbrechen: still signed in, all input kept', mine: true, answer: false, refused: false, asked: true, called: false, done: false },
  { name: 'unsaved input and OK: signed out, only this person\'s input deleted', mine: true, answer: true, refused: false, asked: true, called: true, done: true },
  { name: 'unsaved input, OK, and the server refuses: still here, all input kept, and it says so', mine: true, answer: true, refused: true, asked: true, called: true, done: false },
])('Abmelden, $name', async ({ mine, answer, refused, asked, called, done }) => {
  const own = localDraftKey('restaurant', 'u1', 'e1')
  const other = localDraftKey('restaurant', 'u2', 'e1')
  if (mine) writeLocalDraft(own, copy)
  writeLocalDraft(other, copy)
  const confirm = vi.fn(() => answer)
  window.confirm = confirm
  if (refused) {
    client.signOut.mockResolvedValueOnce({ data: null, error: { status: 500, message: 'Internal Server Error' } })
    vi.spyOn(console, 'error').mockImplementationOnce(() => undefined)
  }
  const wrapper = mountMenu()
  await click(wrapper, 'Abmelden')

  expect(confirm.mock.calls).toEqual(asked ? [['In diesem Browser sind noch ungespeicherte Änderungen. Beim Abmelden werden sie gelöscht. Trotzdem abmelden?']] : [])
  expect(client.signOut).toHaveBeenCalledTimes(called ? 1 : 0)
  expect(navigateTo.mock.calls).toEqual(done ? [['/login']] : [])
  expect(localStorage.getItem(own) !== null).toBe(mine && !done)
  expect(localStorage.getItem(other)).not.toBe(null)
  expect(toasts).toEqual(refused ? [['Abmelden hat nicht geklappt. Bitte versuche es noch einmal.', { tone: 'err' }]] : [])
})

// Wrong behaviour caught: "sign out on other devices" also signed out this device (signOut, revokeSessions), or failed
// and said nothing, so a person with a lost laptop believed it was locked out.
test('Auf anderen Geräten abmelden ends only the other sessions and says whether it worked', async () => {
  const wrapper = mountMenu()
  await click(wrapper, 'Auf anderen Geräten abmelden')
  expect(client.revokeOtherSessions).toHaveBeenCalledTimes(1)
  expect([client.signOut, client.revokeSessions, navigateTo].map((fn) => fn.mock.calls.length)).toEqual([0, 0, 0])
  expect(toasts).toEqual([['Auf allen anderen Geräten abgemeldet. Hier bleibst du angemeldet.', undefined]])

  // Better Auth answers a refusal with an error; it does not throw.
  client.revokeOtherSessions.mockResolvedValueOnce({ data: null, error: { status: 500, message: 'Internal Server Error' } })
  vi.spyOn(console, 'error').mockImplementationOnce(() => undefined)
  await click(wrapper, 'Auf anderen Geräten abmelden')
  expect(toasts.at(-1)).toEqual(['Die anderen Geräte konnten nicht abgemeldet werden. Bitte versuche es noch einmal.', { tone: 'err' }])
})
