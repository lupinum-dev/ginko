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
vi.stubGlobal('useConvexQuery', () => ({ data: ref({ _id: 'e1', brick: 'legal', data: { title: { de: 'Datenschutzerklärung' } } }), error: ref() }))
vi.stubGlobal('useConvexPaginatedQuery', () => ({ data: ref([]), status: ref('success'), error: ref(), canLoadMore: ref(false), isLoadingMore: ref(false), loadMore: () => {} }))
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
