// @vitest-environment happy-dom
// The page an invite mail links to, and the sign-in page it leads to. The German catalog is the real one; Nuxt's
// auto-imports become globals, Convex is replaced.
import { flushPromises, mount } from '@vue/test-utils'
import * as vue from 'vue'
import { expect, test, vi } from 'vitest'
import { useI18n, useState } from '#imports'
import InvitePage from '../app/pages/invite/[token].vue'
import LoginPage from '../app/pages/login.vue'

const { computed, defineComponent, h, nextTick, onMounted, ref, Suspense } = vue
Object.entries({ computed, nextTick, onMounted, ref, useI18n, useState }).forEach(([name, fn]) => vi.stubGlobal(name, fn))
vi.stubGlobal('definePageMeta', () => {})
vi.stubGlobal('useHead', () => {})
vi.stubGlobal('useRoute', () => ({ params: { token: 'tok' }, fullPath: '/invite/tok' }))
vi.stubGlobal('useConvexAuth', () => ({ status: ref('anonymous'), user: ref(null), client: {} }))
vi.stubGlobal('useConvexAuthReturnTo', () => ref('/invite/tok'))
vi.stubGlobal('useConvexMutation', () => ({ mutate: async () => ({}), pending: ref(false) }))
const navigateTo = vi.fn(async () => {})
vi.stubGlobal('navigateTo', navigateTo)
// peek as the server answers a signed-out caller: with the invited address.
const offer = { site: 'Gasthaus zur Linde', url: 'https://linde.example', role: 'staff', rights: ['Speisekarte: Preis ändern'], email: 'neu@example.com', forYou: false }
vi.stubGlobal('useConvexQuery', (fn: unknown) => ({ data: ref(String(fn) === 'invites.peek' ? offer : true), pending: ref(false) }))

const inSuspense = (page: unknown) => defineComponent({ render: () => h(Suspense, null, { default: () => h(page as never) }) })

// Wrong behaviour caught (onboard-4): the invitee opened the link signed out, landed on a bare sign-in page, typed
// another address and waited for a code that never came, because no account exists for an address without an invite.
test('signed out, the invite page names the rights and starts the sign-in with the invited address', async () => {
  const invite = mount(inSuspense(InvitePage), { global: { stubs: { I18nT: true, SignOut: true } } })
  await flushPromises()
  expect(invite.get('h1').text()).toBe('Einladung zu Gasthaus zur Linde')
  expect(invite.get('li').text()).toBe('Speisekarte: Preis ändern')
  expect(invite.findComponent({ name: 'SignOut' }).exists()).toBe(false)
  await invite.findAll('button').find((b) => b.text() === 'Anmelden')!.trigger('click')
  expect(navigateTo).toHaveBeenCalledWith('/login?redirect=%2Finvite%2Ftok')

  const login = mount(inSuspense(LoginPage), { global: { stubs: { I18nT: true } } })
  await flushPromises()
  expect((login.get('#email').element as HTMLInputElement).value).toBe('neu@example.com')
})

// Wrong behaviour caught: the optional name was saved before the invite was accepted; when the name failed (a server
// limit), the invitee could not accept until they cleared the optional field.
test('signed in, the invite is accepted also when the optional name cannot be saved', async () => {
  const toasts: string[] = []
  const calls: string[] = []
  vi.stubGlobal('useToast', () => ({ show: (text: string) => toasts.push(text) }))
  vi.stubGlobal('opErrorOf', () => ({ code: 'INVALID', message: 'Der Name ist zu lang.' }))
  vi.stubGlobal('useConvexQuery', (fn: unknown) => ({
    data: ref(String(fn) === 'invites.peek' ? { ...offer, email: undefined, forYou: true } : { remindByMail: true }), pending: ref(false),
  }))
  vi.stubGlobal('useConvexMutation', (fn: unknown) => ({
    mutate: async () => {
      calls.push(String(fn))
      if (String(fn) === 'account.setName') throw new Error('too long')
      return { site: 'linde' }
    },
    pending: ref(false),
  }))
  try {
    const invite = mount(inSuspense(InvitePage), { global: { stubs: { I18nT: true, SignOut: true } } })
    await flushPromises()
    await invite.get('#invite-name').setValue('Franz')
    await invite.findAll('button').find((b) => b.text() === 'Einladung annehmen')!.trigger('click')
    await flushPromises()
    expect(calls).toEqual(['invites.accept', 'account.setName'])
    expect(navigateTo).toHaveBeenLastCalledWith('/s/linde', { replace: true })
    expect(toasts).toEqual(['Der Name ist zu lang.'])
  } finally {
    vi.stubGlobal('useConvexQuery', (fn: unknown) => ({ data: ref(String(fn) === 'invites.peek' ? offer : true), pending: ref(false) }))
    vi.stubGlobal('useConvexMutation', () => ({ mutate: async () => ({}), pending: ref(false) }))
  }
})
