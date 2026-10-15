// @vitest-environment happy-dom
// The list of a collection (Alles bearbeiten → one area): search runs on the server, so an answer arrives
// after the box changed. The German catalog is the real one; Nuxt's auto-imports become globals, Convex is replaced.
import { flushPromises, mount } from '@vue/test-utils'
import * as vue from 'vue'
import { expect, test, vi } from 'vitest'
import { collection, defineSite, f } from '@lupinum/ginko'
import { serializeSchema } from '@lupinum/ginko/internal'
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
const list = { data: ref<unknown>(), pending: ref(true), isStale: ref(false) }
vi.stubGlobal('useConvexQuery', (fn: string, args: () => unknown, options?: { keepPreviousData?: boolean }) => {
  if (String(fn) !== 'entries.list') return { data: ref(undefined), pending: ref(false), isStale: ref(false) }
  watch(() => JSON.stringify(toValue(args)), (now) => {
    answers.push(JSON.parse(now) as { search?: string })
    if (!options?.keepPreviousData) list.data.value = undefined
    list.isStale.value = list.data.value !== undefined
    list.pending.value = true
  }, { immediate: true })
  return list
})
const answer = (page: { rows: { _id: string; title: string; state: string; dates: object; gaps: [] }[]; total: number }) => {
  list.data.value = page
  list.pending.value = false
  list.isStale.value = false
}

// Wrong behaviour caught: while a cleared search loads, the last (empty) answer hid the search box under the
// person's cursor and said "Noch keine Einträge." for a collection that has entries.
test('clearing a search with no match keeps the search box and shows no empty state while the list loads', async () => {
  vi.useFakeTimers()
  try {
    const wrapper = mount(defineComponent({ render: () => h(Suspense, null, { default: () => h(ListPage) }) }), {
      global: { mocks: { shownLabel }, stubs: { AllShell: { template: '<div><slot /></div>' }, SavedViews: { name: 'SavedViews', props: ['search'], emits: ['update:search'], template: '<input class="views" />' }, TranslationBadges: true, EntryEditor: true, NuxtLink: true } },
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
  } finally {
    vi.useRealTimers()
  }
})
