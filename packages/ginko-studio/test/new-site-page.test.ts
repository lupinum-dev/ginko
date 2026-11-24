// @vitest-environment happy-dom
// "Neue Seite": a platform admin creates the empty site of a website. The German catalog is the real one; Nuxt's
// auto-imports become globals, and Convex is replaced.
import { flushPromises, mount } from '@vue/test-utils'
import * as vue from 'vue'
import { beforeEach, expect, test, vi } from 'vitest'
import { useI18n } from '#imports'
import NewSitePage from '../app/pages/new.vue'

const { computed, defineComponent, h, ref, Suspense, watch } = vue
Object.entries({ computed, ref, watch, useI18n }).forEach(([name, fn]) => vi.stubGlobal(name, fn))
vi.stubGlobal('definePageMeta', () => {})
vi.stubGlobal('useHead', () => {})
const navigateTo = vi.fn(async () => {})
vi.stubGlobal('navigateTo', navigateTo)
let allowed = true
vi.stubGlobal('useConvexQuery', () => ({ data: ref(allowed), error: ref(undefined) }))
/** What the page sent, and what the server answers: the slug, or a refusal. */
const sent: unknown[] = []
let refusal: { code: string; message: string } | undefined
vi.stubGlobal('useConvexMutation', () => ({
  mutate: async (args: { slug: string }) => {
    sent.push(args)
    if (refusal) throw refusal
    return { slug: args.slug }
  },
  pending: ref(false),
}))
vi.stubGlobal('opErrorOf', (e: unknown) => e)

beforeEach(() => {
  allowed = true
  refusal = undefined
  sent.length = 0
  navigateTo.mockClear()
})

async function mountPage() {
  const wrapper = mount(defineComponent({ render: () => h(Suspense, null, { default: () => h(NewSitePage) }) }), {
    attachTo: document.body,
    global: { stubs: { NuxtLink: { props: ['to'], template: '<a :href="to"><slot /></a>' } } },
  })
  await flushPromises()
  return wrapper
}
const valueOf = (wrapper: Awaited<ReturnType<typeof mountPage>>, id: string) => (wrapper.get(`#${id}`).element as HTMLInputElement).value

// Wrong behaviour caught: the admin has to invent an identifier the server accepts ("Café Central 2" is refused), and
// an identifier they typed themselves is overwritten when they correct the name afterwards.
test('the identifier follows the name until the admin types one, and the form opens the new site', async () => {
  const wrapper = await mountPage()
  await wrapper.get('#site-name').setValue('  Café Central 2 ')
  expect(valueOf(wrapper, 'site-id')).toBe('cafe-central-2')
  await wrapper.get('#site-id').setValue('central')
  await wrapper.get('#site-name').setValue('Café Central Wien')
  expect(valueOf(wrapper, 'site-id')).toBe('central')

  await wrapper.get('#site-url').setValue(' https://www.cafe-central.example ')
  await wrapper.get('form').trigger('submit')
  await flushPromises()
  expect(sent).toEqual([{ slug: 'central', name: 'Café Central Wien', url: 'https://www.cafe-central.example' }])
  expect(navigateTo).toHaveBeenCalledWith('/s/central/all')
  wrapper.unmount()
})

// Wrong behaviour caught: a form with a missing address or a wrong identifier goes to the server, and the answer names
// no field; a taken identifier reads "This address is already taken", which the admin takes for the website address.
test('wrong values are named at their field before anything is sent, and a taken identifier is named as such', async () => {
  const wrapper = await mountPage()
  await wrapper.get('#site-name').setValue('Linde')
  await wrapper.get('#site-id').setValue('1-Linde')
  await wrapper.get('form').trigger('submit')
  await flushPromises()
  expect(sent).toEqual([])
  expect(wrapper.find('#site-name-problem').exists()).toBe(false)
  expect(wrapper.get('#site-url-problem').text()).toBe('Gib die ganze Adresse ein, zum Beispiel https://www.example.com.')
  expect(wrapper.get('#site-id-problem').text()).toBe('Beginne mit einem Kleinbuchstaben, dann 1 bis 40 Kleinbuchstaben, Ziffern oder Bindestriche.')
  expect(document.activeElement?.id).toBe('site-url')

  await wrapper.get('#site-url').setValue('https://linde.example')
  await wrapper.get('#site-id').setValue('linde')
  refusal = { code: 'SLUG_TAKEN', message: 'Diese Adresse ist schon vergeben.' }
  await wrapper.get('form').trigger('submit')
  await flushPromises()
  expect(wrapper.get('[role="alert"]').text()).toBe('Die Kennung „linde“ ist schon vergeben. Wähle eine andere.')
  expect(navigateTo).not.toHaveBeenCalled()
  wrapper.unmount()
})

// Wrong behaviour caught: an owner who opens /new fills in a form that can only end in a refusal.
test('anyone but an admin gets one sentence, no form', async () => {
  allowed = false
  const wrapper = await mountPage()
  expect(wrapper.find('form').exists()).toBe(false)
  expect(wrapper.text()).toContain('Nur Admins dieser Plattform legen Seiten an.')
  wrapper.unmount()
})
