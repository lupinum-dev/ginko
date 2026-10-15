// @vitest-environment happy-dom
// The ⌘K palette: what an empty query offers, and that typing searches and Enter opens. Only the Convex query and
// navigation are replaced; the translator is ginko-i18n's real one (the Studio's German catalog, via the test shim).
import { flushPromises, mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest'
import type { Schema } from '@lupinum/ginko/internal'
import CommandPalette from '../app/components/CommandPalette.vue'

const mocks = vi.hoisted(() => ({
  navigateTo: vi.fn(),
  asked: [] as unknown[],
  found: { entries: [] as unknown[], bricks: [] as unknown[], tasks: [] as unknown[] },
  /** While true, a new search has no answer yet (as on a slow connection); the test answers by setting it false. */
  slow: { value: false },
}))
vi.mock('#imports', async (original) => {
  const { ref, watch } = await import('vue')
  const slow = ref(false)
  mocks.slow = slow
  return {
    ...(await original<Record<string, unknown>>()),
    navigateTo: mocks.navigateTo,
    // Answers like better-convex: with keepPreviousData the last answer stays, stale, until the new one arrives.
    useConvexQuery: (_query: unknown, args: () => unknown, options?: { keepPreviousData?: boolean }) => {
      const data = ref<unknown>()
      const isStale = ref(false)
      watch([args, slow], ([a, waiting]) => {
        if (a === 'skip') { data.value = undefined; isStale.value = false; return }
        mocks.asked.push(a)
        if (!waiting) { data.value = mocks.found; isStale.value = false; return }
        if (!options?.keepPreviousData) data.value = undefined
        isStale.value = data.value !== undefined
      }, { immediate: true })
      return { data, isStale }
    },
  }
})

const create = (id: string) => ({ id, kind: 'create', label: 'Neu' })
const schema = {
  locales: ['de', 'en'],
  bricks: {
    events: { kind: 'collection', label: { de: 'Veranstaltungen' }, fields: {}, tasks: [create('add')] },
    menu: { kind: 'collection', label: { de: 'Speisekarte' }, fields: {}, tasks: [create('add')] },
    contact: { kind: 'single', label: { de: 'Kontakt' }, fields: { phone: { type: 'text', label: { de: 'Telefon' } } } },
  },
} as unknown as Schema

const mountPalette = (props: { role: string; grants: string[] }) =>
  mount(CommandPalette, { props: { open: true, slug: 's', schema, ...props }, attachTo: document.body })
const optionTexts = () => [...document.body.querySelectorAll('[role="option"]')].map((el) => (el.children.length ? [...el.children].map((c) => c.textContent).join(' ') : el.textContent?.trim()))

beforeAll(() => {
  // reka-ui positions and scrolls with these; happy-dom has neither.
  globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as never
  Element.prototype.scrollIntoView ??= () => {}
})
beforeEach(() => { mocks.navigateTo.mockClear(); mocks.asked.length = 0; mocks.slow.value = false; localStorage.clear() })
afterEach(() => { document.body.innerHTML = '' })

describe('CommandPalette', () => {
  test('an empty query shows recent entries and the actions; "New" only for areas the person may create in', async () => {
    localStorage.setItem('ginko:recent:s', JSON.stringify([{ to: '/s/s/all/menu/e1', label: 'Schnitzel', area: 'Speisekarte' }]))
    const staff = mountPalette({ role: 'staff', grants: ['events.add'] })
    await flushPromises()
    expect(optionTexts()).toEqual(['Schnitzel Speisekarte', 'Neu: Veranstaltungen', 'Dateien', 'Verlauf'])
    staff.unmount()
    document.body.innerHTML = ''

    mountPalette({ role: 'owner', grants: [] })
    await flushPromises()
    // Owners also get Review and Update website now; a single (Kontakt) has nothing to create.
    expect(optionTexts()).toEqual(['Schnitzel Speisekarte', 'Neu: Veranstaltungen', 'Neu: Speisekarte', 'Dateien', 'Verlauf', 'Prüfen', 'Website jetzt aktualisieren'])
  })

  test('typing searches the site and Enter opens the first result', async () => {
    mocks.found = { entries: [{ entry: 'e1', brick: 'menu', brickLabel: 'Speisekarte', label: 'Schnitzel', snippet: '', state: 'live' }], bricks: [{ brick: 'events', label: 'Veranstaltungen', kind: 'collection' }], tasks: [] }
    const wrapper = mountPalette({ role: 'owner', grants: [] })
    await flushPromises()
    const input = document.body.querySelector('input')!
    input.value = 'sch'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await new Promise((resolve) => setTimeout(resolve, 250))
    await nextTick()

    expect(mocks.asked).toContainEqual({ site: 's', query: 'sch' })
    expect(optionTexts()).toEqual(['Schnitzel Speisekarte Online', 'Veranstaltungen'])

    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    await flushPromises()
    expect(mocks.navigateTo).toHaveBeenCalledWith('/s/s/all/menu/e1', undefined)
    expect(wrapper.emitted('update:open')?.at(-1)).toEqual([false])
  })

  // Wrong behaviour caught (WS-7): an area found by "Telefon" showed only its name, so nothing said why it was listed.
  test('an area found by one of its fields names that field next to it', async () => {
    mocks.found = { entries: [], bricks: [{ brick: 'contact', label: 'Kontakt', kind: 'single', field: 'phone' }, { brick: 'events', label: 'Veranstaltungen', kind: 'collection' }], tasks: [] }
    mountPalette({ role: 'owner', grants: [] })
    await flushPromises()
    const input = document.body.querySelector('input')!
    input.value = 'telefon'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await new Promise((resolve) => setTimeout(resolve, 250))
    await nextTick()
    expect(optionTexts()).toEqual(['Kontakt Telefon', 'Veranstaltungen'])
  })

  // Wrong behaviour caught: the results vanish between keystrokes while the next search loads.
  test('while the next search loads, the last results stay', async () => {
    const schnitzel = { entry: 'e1', brick: 'menu', brickLabel: 'Speisekarte', label: 'Schnitzel', snippet: '', state: 'live' }
    mocks.found = { entries: [schnitzel], bricks: [], tasks: [] }
    mountPalette({ role: 'owner', grants: [] })
    await flushPromises()
    const input = document.body.querySelector('input')!
    const type = async (text: string) => {
      input.value = text
      input.dispatchEvent(new Event('input', { bubbles: true }))
      await new Promise((resolve) => setTimeout(resolve, 250))
      await nextTick()
    }
    await type('sch')
    mocks.slow.value = true
    await type('schw')
    expect(mocks.asked).toContainEqual({ site: 's', query: 'schw' })
    expect(optionTexts()).toEqual(['Schnitzel Speisekarte Online'])
    expect(document.body.textContent).not.toContain('Nichts gefunden')

    mocks.found = { entries: [{ ...schnitzel, entry: 'e2', label: 'Schweinsbraten' }], bricks: [], tasks: [] }
    mocks.slow.value = false
    await nextTick()
    expect(optionTexts()).toEqual(['Schweinsbraten Speisekarte Online'])
  })
})
