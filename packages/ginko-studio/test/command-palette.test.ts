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
  /** While true, a new search fails (a timeout). */
  failing: false,
  /** The person's sites (sites.mine). */
  sites: [] as unknown[],
}))
vi.mock('#imports', async (original) => {
  const { computed, ref, watch } = await import('vue')
  const slow = ref(false)
  mocks.slow = slow
  return {
    ...(await original<Record<string, unknown>>()),
    navigateTo: mocks.navigateTo,
    // Answers like better-convex: with keepPreviousData the last answer stays, stale, until the new one arrives; a
    // failed answer keeps it too, next to the error. New arguments clear the error.
    useConvexQuery: (query: unknown, args: () => unknown, options?: { keepPreviousData?: boolean }) => {
      if (String(query) === 'sites.mine') return { data: computed(() => (args() === 'skip' ? undefined : mocks.sites)), isStale: ref(false), error: ref() }
      const data = ref<unknown>()
      const isStale = ref(false)
      const error = ref<unknown>()
      watch([args, slow], ([a, waiting]) => {
        error.value = undefined
        if (a === 'skip') { data.value = undefined; isStale.value = false; return }
        mocks.asked.push(a)
        if (mocks.failing) { error.value = new Error('Function execution timed out'); isStale.value = data.value !== undefined; return }
        if (!waiting) { data.value = mocks.found; isStale.value = false; return }
        if (!options?.keepPreviousData) data.value = undefined
        isStale.value = data.value !== undefined
      }, { immediate: true })
      return { data, isStale, error }
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
/** Types into the filter and waits past the pause before searching. */
const typeQuery = async (text: string) => {
  const input = document.body.querySelector('input')!
  input.value = text
  input.dispatchEvent(new Event('input', { bubbles: true }))
  await new Promise((resolve) => setTimeout(resolve, 250))
  await nextTick()
}
const optionTexts = () => [...document.body.querySelectorAll('[role="option"]')].map((el) => (el.children.length ? [...el.children].map((c) => c.textContent).join(' ') : el.textContent?.trim()))

beforeAll(() => {
  // reka-ui positions and scrolls with these; happy-dom has neither.
  globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as never
  Element.prototype.scrollIntoView ??= () => {}
})
beforeEach(() => { mocks.navigateTo.mockClear(); mocks.asked.length = 0; mocks.slow.value = false; mocks.failing = false; mocks.sites = []; localStorage.clear() })
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

  // Wrong behaviour caught: an agency inside one site typed another site's name and got "Nichts gefunden"; or picked a
  // site being deleted, offered like any other, and landed on its deletion page.
  test('typing another site\'s name lists it under Seiten, and Enter opens it', async () => {
    mocks.found = { entries: [], bricks: [], tasks: [] }
    mocks.sites = [
      { slug: 's', name: 'Gasthaus am See', url: 'https://see.test', role: 'admin', deleting: false },
      { slug: 'linde', name: 'Gasthaus zur Linde', url: 'https://linde.test', role: 'admin', deleting: false },
      { slug: 'alt', name: 'Gasthof Alt', url: 'https://alt.test', role: 'admin', deleting: true },
      { slug: 'lupinum', name: 'Lupinum', url: 'https://lupinum.test', role: 'admin', deleting: false },
    ]
    mountPalette({ role: 'owner', grants: [] })
    await flushPromises()
    await typeQuery('gast')
    // The open site is not offered: there is nowhere to switch.
    expect(optionTexts()).toEqual(['Gasthaus zur Linde linde.test', 'Gasthof Alt alt.test · Wird gelöscht'])
    expect([...document.body.querySelectorAll('[role="group"]')].map((g) => g.textContent)).toEqual(['SeitenGasthaus zur Lindelinde.testGasthof Altalt.test · Wird gelöscht'])
    expect(document.body.textContent).not.toContain('Nichts gefunden')

    document.body.querySelector('input')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    await flushPromises()
    expect(mocks.navigateTo).toHaveBeenCalledWith('/s/linde', undefined)
  })

  // Wrong behaviour caught: the results vanish between keystrokes while the next search loads.
  test('while the next search loads, the last results stay', async () => {
    const schnitzel = { entry: 'e1', brick: 'menu', brickLabel: 'Speisekarte', label: 'Schnitzel', snippet: '', state: 'live' }
    mocks.found = { entries: [schnitzel], bricks: [], tasks: [] }
    mountPalette({ role: 'owner', grants: [] })
    await flushPromises()
    await typeQuery('sch')
    mocks.slow.value = true
    await typeQuery('schw')
    expect(mocks.asked).toContainEqual({ site: 's', query: 'schw' })
    expect(optionTexts()).toEqual(['Schnitzel Speisekarte Online'])
    expect(document.body.textContent).not.toContain('Nichts gefunden')

    mocks.found = { entries: [{ ...schnitzel, entry: 'e2', label: 'Schweinsbraten' }], bricks: [], tasks: [] }
    mocks.slow.value = false
    await nextTick()
    expect(optionTexts()).toEqual(['Schweinsbraten Speisekarte Online'])
  })

  // Wrong behaviour caught: a failed search left the result area blank, or showed the last word's results as if they
  // matched the new one; or Enter then switched to a site whose name matched, though the word was meant for an entry.
  test('a failed search says so instead of showing the last results, Enter opens nothing, and Erneut versuchen asks again', async () => {
    const schnitzel = { entry: 'e1', brick: 'menu', brickLabel: 'Speisekarte', label: 'Schnitzel', snippet: '', state: 'live' }
    mocks.found = { entries: [schnitzel], bricks: [], tasks: [] }
    mocks.sites = [{ slug: 'schwan', name: 'Schwanenwirt', url: 'https://schwan.test', role: 'admin', deleting: false }]
    mountPalette({ role: 'owner', grants: [] })
    await flushPromises()
    await typeQuery('sch')
    mocks.failing = true
    await typeQuery('schw')
    expect(optionTexts()).toEqual(['Schwanenwirt schwan.test'])
    expect(document.body.querySelector('[role="status"]')?.textContent).toBe('Die Suche hat gerade nicht geklappt. Erneut versuchen')
    document.body.querySelector('input')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    await flushPromises()
    expect(mocks.navigateTo).not.toHaveBeenCalled()

    mocks.failing = false
    mocks.found = { entries: [{ ...schnitzel, entry: 'e2', label: 'Schweinsbraten' }], bricks: [], tasks: [] }
    const before = mocks.asked.length
    ;[...document.body.querySelectorAll('button')].find((b) => b.textContent === 'Erneut versuchen')!.click()
    await flushPromises()
    expect(mocks.asked.slice(before)).toEqual([{ site: 's', query: 'schw' }])
    expect(optionTexts()).toEqual(['Schweinsbraten Speisekarte Online', 'Schwanenwirt schwan.test'])
  })
})
