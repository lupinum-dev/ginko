// @vitest-environment happy-dom
// Verlauf: the page of one entry's history. The German catalog is the real one; Nuxt's auto-imports become globals,
// Convex is replaced.
import { flushPromises, mount } from '@vue/test-utils'
import * as vue from 'vue'
import { expect, test, vi } from 'vitest'
import { collection, defineSite, f } from '@lupinum/ginko'
import { serializeSchema } from '@lupinum/ginko/internal'
import { useI18n } from '#imports'
import HistoryPage from '../app/pages/s/[site]/history/index.vue'
import ChangeDiff from '../app/components/ChangeDiff.vue'
import ChangeRows from '../app/components/ChangeRows.vue'

const { computed, defineComponent, h, onMounted, onUnmounted, ref, Suspense } = vue
Object.entries({ computed, onMounted, onUnmounted, ref, useI18n }).forEach(([name, fn]) => vi.stubGlobal(name, fn))

const schema = serializeSchema(defineSite({
  site: 'restaurant', name: 'Restaurant', url: 'https://restaurant.test', timeZone: 'Europe/Vienna', locales: ['de'], currency: 'EUR',
  pages: { home: { de: '/' } },
  bricks: { legal: collection({ label: 'Rechtliches', max: 10, order: 'manual', fields: { title: f.text('Titel') } }) },
}))

vi.stubGlobal('definePageMeta', () => {})
vi.stubGlobal('useHead', () => {})
vi.stubGlobal('useRoute', () => ({ params: { site: 'restaurant' }, query: { entry: 'e1' } }))
vi.stubGlobal('useStudioSite', () => ({ shown: (label: Record<string, string>) => label.de }))
vi.stubGlobal('useSiteData', async () => ({ slug: ref('restaurant'), schema: ref(schema), site: ref({ name: 'Restaurant' }), main: ref('de'), isManager: ref(true), grants: ref(new Set()) }))
/** What each Convex query answers, by name (the test API shim names them, e.g. "entries.get"). */
const answers: Record<string, unknown> = { 'entries.get': { _id: 'e1', brick: 'legal', data: { title: { de: 'Datenschutzerklärung' } } } }
vi.stubGlobal('useConvexQuery', (query: unknown, args: () => unknown) => ({ data: computed(() => (args() === 'skip' ? undefined : answers[String(query)])), error: ref() }))
/** The rows of the history list. */
const changes = ref<unknown[]>([])
vi.stubGlobal('useConvexPaginatedQuery', () => ({ data: changes, status: ref('success'), error: ref(), canLoadMore: ref(false), isLoadingMore: ref(false), loadMore: () => {} }))
vi.stubGlobal('useOps', () => ({}))

// Wrong behaviour caught: "Verlauf dieses Eintrags" opened a page titled only "Verlauf", with no way back, and an
// entry nobody changed since the import said "Keine Änderungen für diesen Filter.", so the owner thought it was broken.
test('the history of one entry names it, links back to it and says plainly that nothing was changed yet', async () => {
  const wrapper = mount(defineComponent({ render: () => h(Suspense, null, { default: () => h(HistoryPage) }) }), {
    global: {
      components: { ChangeRows },
      stubs: { SiteZoneNote: true, OwnProposals: true, ChangeDetail: true, NuxtLink: { props: ['to'], template: '<a :href="to"><slot /></a>' } },
    },
  })
  await flushPromises()
  expect(wrapper.get('h1').text()).toBe('Verlauf: Datenschutzerklärung')
  expect(wrapper.get('a[href="/s/restaurant/all/legal/e1"]').text()).toBe('← Zurück zu „Datenschutzerklärung“')
  expect(wrapper.text()).toContain('Noch keine Änderungen. Was ab jetzt gespeichert wird, steht hier.')
  expect(wrapper.text()).not.toContain('für diesen Filter')
})

// Wrong behaviour caught: the "Rückgängig" rows, which hold the good state after a bad save, offered no way back, and
// the question named only a date: before or after this change? (R6)
test('a Rückgängig row can be gone back to, and the question shows what that changes', async () => {
  changes.value = [{ _id: 'c2', kind: 'undo', entry: 'e1', brick: 'legal', fields: ['title'], at: Date.UTC(2026, 9, 8, 10), msg: null, sentence: 'Rückgängig: Titel von „Impressum“ geändert', who: { email: 'anna@example.test' }, agent: null, undoBlocked: null }]
  answers['entries.versionAt'] = { change: 'c2', diff: [{ field: 'title', label: 'Titel', kind: 'text', before: { de: 'Impressum neu' }, after: { de: 'Impressum' }, locales: [{ locale: 'de', before: 'Impressum neu', after: 'Impressum' }] }] }
  const wrapper = mount(ChangeRows, { props: { site: 'restaurant', schema, manager: true, grants: new Set<string>(), filter: 'entry', entry: 'e1' }, global: { components: { ChangeDiff }, stubs: { ChangeDetail: true, NuxtLink: true } } })
  await wrapper.findAll('button').find((b) => b.text() === 'Zurück zu dieser Version')!.trigger('click')
  const question = wrapper.get('[role="group"]')
  expect(question.text()).toContain('Zum Stand direkt nach dieser Änderung (')
  expect(question.text()).toMatch(/Das ändert sich:\s*Titel\s*Vorher\s*Impressum neu\s*Nachher\s*Impressum/)
})

// Wrong behaviour caught: "Papierkorb öffnen" stayed on a removal after the entry was restored or deleted for good, and
// led to a trash that did not hold it.
test('a removal links to the trash only while its entry is still there', () => {
  const removal = (id: string, inTrash: boolean) => ({ _id: id, kind: 'remove', entry: 'e1', brick: 'legal', at: Date.UTC(2026, 9, 8, 10), msg: null, sentence: '„Impressum“ entfernt', who: { email: 'anna@example.test' }, agent: null, undoBlocked: null, inTrash })
  changes.value = [removal('c2', true), removal('c1', false)]
  const wrapper = mount(ChangeRows, { props: { site: 'restaurant', schema, manager: true, grants: new Set<string>() }, global: { stubs: { ChangeDetail: true, NuxtLink: { props: ['to'], template: '<a :href="to"><slot /></a>' } } } })
  const rows = wrapper.findAll('li')
  expect(rows.map((row) => row.findAll('a').map((a) => [a.text(), a.attributes('href')]))).toEqual([[['Papierkorb öffnen', '/s/restaurant/all?removed']], []])
})
