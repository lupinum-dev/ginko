// @vitest-environment happy-dom
// The list of a collection (Alles bearbeiten → one area): search runs on the server, so an answer arrives
// after the box changed. The German catalog is the real one; Nuxt's auto-imports become globals, Convex is replaced.
import { flushPromises, mount } from '@vue/test-utils'
import * as vue from 'vue'
import { expect, test, vi } from 'vitest'
import { collection, defineSite, f } from '@lupinum/ginko'
import { serializeSchema } from '@lupinum/ginko/internal'
import { ConvexError } from 'convex/values'
import { normalizeConvexError } from '@lupinum/better-convex-nuxt/errors'
import { useI18n } from '#imports'
import { shownLabel } from '../app/utils/labels'
import ListPage from '../app/pages/s/[site]/all/[brick]/index.vue'

const { computed, defineComponent, h, onBeforeUnmount, ref, Suspense, toValue, watch } = vue
Object.entries({ computed, onBeforeUnmount, ref, watch, useI18n }).forEach(([name, fn]) => vi.stubGlobal(name, fn))

const schema = serializeSchema(defineSite({
  site: 'restaurant', name: 'Restaurant', url: 'https://restaurant.test', timeZone: 'Europe/Vienna', locales: ['de'], currency: 'EUR',
  pages: { home: { de: '/' } },
  bricks: { dishes: collection({ label: 'Gerichte', max: 500, order: 'manual', fields: { title: f.text('Name') } }) },
}))
const brick = schema.bricks.dishes!

vi.stubGlobal('definePageMeta', () => {})
vi.stubGlobal('useHead', () => {})
vi.stubGlobal('useRoute', () => ({ params: { site: 'restaurant', brick: 'dishes' }, query: {} }))
vi.stubGlobal('useStudioSite', () => ({ shown: (label: string) => label }))
vi.stubGlobal('useOps', () => ({}))
vi.stubGlobal('useSiteData', async () => ({
  slug: ref('restaurant'), schema: ref(schema), site: ref({ slug: 'restaurant' }), main: ref('de'), today: ref('2026-10-15'), isManager: ref(true),
}))
vi.stubGlobal('allAccess', () => ({ editable: computed(() => [['dishes', brick]]), tasksFor: () => ({ all: true }) }))

// entries.list answers like better-convex: new arguments subscribe again, and the answer arrives later (`answer`).
// With keepPreviousData the last answer stays, marked stale, until then.
const answers: { search?: string }[] = []
const list = { data: ref<unknown>(), pending: ref(true), isStale: ref(false), error: ref<unknown>() }
/** entries.removed (the "Entfernt" section): the test sets its answer. */
const removed = { data: ref<unknown>(), pending: ref(false), isStale: ref(false), error: ref<unknown>() }
vi.stubGlobal('useConvexQuery', (fn: string, args: () => unknown, options?: { keepPreviousData?: boolean }) => {
  if (String(fn) === 'entries.removed') return removed
  if (String(fn) !== 'entries.list') return { data: ref(undefined), pending: ref(false), isStale: ref(false), error: ref() }
  watch(() => JSON.stringify(toValue(args)), (now) => {
    answers.push(JSON.parse(now) as { search?: string })
    if (!options?.keepPreviousData) list.data.value = undefined
    list.isStale.value = list.data.value !== undefined
    list.pending.value = true
    list.error.value = undefined
  }, { immediate: true })
  return list
})
const answer = (page: { rows: { _id: string; title: string; state: string; dates: object; gaps: [] }[]; total: number }) => {
  list.data.value = page
  list.pending.value = false
  list.isStale.value = false
}
// A failed answer keeps the last data, still stale (better-convex rc.3: isStale covers pending or errored).
const fail = (error: unknown) => {
  list.error.value = error
  list.pending.value = false
  list.isStale.value = list.data.value !== undefined
}
const stubs = { AllShell: { template: '<div><slot /></div>' }, SavedViews: { name: 'SavedViews', props: ['search'], emits: ['update:search'], template: '<input class="views" />' }, TranslationBadges: true, EntryEditor: true, NuxtLink: true }

// Wrong behaviour caught: while a cleared search loads, or when its answer fails, the last (empty) answer hid the
// search box under the person's cursor and said "Noch keine Einträge." for a collection that has entries.
test('clearing a search with no match keeps the search box and shows no empty state while the list loads', async () => {
  vi.useFakeTimers()
  try {
    const wrapper = mount(defineComponent({ render: () => h(Suspense, null, { default: () => h(ListPage) }) }), {
      global: { mocks: { shownLabel }, stubs },
    })
    await flushPromises()
    answer({ rows: [{ _id: 'e1', title: 'Saibling', state: 'published', dates: {}, gaps: [] }], total: 1 })
    await flushPromises()

    wrapper.findComponent({ name: 'SavedViews' }).vm.$emit('update:search', 'zzz')
    await vi.advanceTimersByTimeAsync(300)
    answer({ rows: [], total: 0 })
    await flushPromises()
    expect(wrapper.text()).toContain('Kein Eintrag passt.')

    wrapper.findComponent({ name: 'SavedViews' }).vm.$emit('update:search', '')
    await vi.advanceTimersByTimeAsync(300)
    expect(answers.at(-1)?.search).toBe(undefined)
    expect(wrapper.find('.views').exists()).toBe(true)
    expect(wrapper.text()).not.toContain('Noch keine Einträge.')

    // The answer to the cleared search fails: the empty search page is still not the current answer.
    fail(normalizeConvexError(new ConvexError({ code: 'FORBIDDEN', message: 'Du hast keinen Zugriff auf diesen Bereich.' }), { functionName: 'entries:list' }))
    await flushPromises()
    expect(wrapper.find('.views').exists()).toBe(true)
    expect(wrapper.text()).not.toContain('Noch keine Einträge.')
  } finally {
    vi.useRealTimers()
  }
})

// Wrong behaviour caught: when "Mehr anzeigen" fails (access removed, a server error), the kept list stayed dimmed
// as if loading and nothing said what went wrong; or the button came back enabled although a click asks for the
// same rows again and does nothing.
test('a list answer that fails after a page loaded says why, does not stay dimmed and offers no dead button', async () => {
  const wrapper = mount(defineComponent({ render: () => h(Suspense, null, { default: () => h(ListPage) }) }), { global: { mocks: { shownLabel }, stubs } })
  await flushPromises()
  const rows = Array.from({ length: 50 }, (_, i) => ({ _id: `e${i}`, title: `Gericht ${i}`, state: 'published', dates: {}, gaps: [] as [] }))
  answer({ rows, total: 60 })
  await flushPromises()

  await wrapper.find('button:not([aria-label])').trigger('click')
  fail(normalizeConvexError(new ConvexError({ code: 'FORBIDDEN', message: 'Du hast keinen Zugriff auf diesen Bereich.' }), { functionName: 'entries:list' }))
  await flushPromises()

  expect(wrapper.find('[role="alert"]').text()).toBe('Du hast keinen Zugriff auf diesen Bereich.')
  expect(wrapper.find('ol').attributes('aria-busy')).toBe(undefined)
  expect(wrapper.find('button:not([aria-label])').attributes('disabled')).toBe('')
})

// Wrong behaviour caught: a list that failed to load for a reason the server did not name said "Deine Eingaben sind
// noch da. Bitte noch einmal versuchen.", the text for a failed save, although nothing was typed.
test('a list that fails without a server message says it could not load', async () => {
  const wrapper = mount(defineComponent({ render: () => h(Suspense, null, { default: () => h(ListPage) }) }), { global: { mocks: { shownLabel }, stubs } })
  await flushPromises()
  vi.spyOn(console, 'error').mockImplementationOnce(() => undefined)
  fail(normalizeConvexError(new Error('Connection lost while action was in flight'), { functionName: 'entries:list' }))
  await flushPromises()
  expect(wrapper.find('[role="alert"]').text()).toBe('Das ließ sich nicht laden. Bitte lade die Seite neu.')
})

// Wrong behaviour caught: when the removed entries failed to load (or stuck after a restore), "Entfernt" kept showing an
// entry that was back, with an active Wiederherstellen, and nothing said the page was out of date.
test('a failed answer for the removed entries shows the alert while the list is fine', async () => {
  const wrapper = mount(defineComponent({ render: () => h(Suspense, null, { default: () => h(ListPage) }) }), { global: { mocks: { shownLabel }, stubs } })
  await flushPromises()
  answer({ rows: [{ _id: 'e1', title: 'Saibling', state: 'published', dates: {}, gaps: [] }], total: 1 })
  try {
    removed.data.value = [{ _id: 'e2', title: 'Forelle', lifeRev: 2 }]
    vi.spyOn(console, 'error').mockImplementationOnce(() => undefined)
    removed.error.value = normalizeConvexError(new Error('Function execution timed out'), { functionName: 'entries:removed' })
    await flushPromises()
    expect(wrapper.find('[role="alert"]').text()).toBe('Das ließ sich nicht laden. Bitte lade die Seite neu.')
  } finally {
    removed.data.value = undefined
    removed.error.value = undefined
  }
})
