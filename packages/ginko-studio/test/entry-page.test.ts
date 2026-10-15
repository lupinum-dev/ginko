// @vitest-environment happy-dom
// The page of one entry (Alles bearbeiten → an entry). The German catalog is the real one; Nuxt's auto-imports
// become globals, Convex and the editor are replaced.
import { flushPromises, mount } from '@vue/test-utils'
import * as vue from 'vue'
import { expect, test, vi } from 'vitest'
import { collection, defineSite, f } from '@lupinum/ginko'
import { serializeSchema } from '@lupinum/ginko/internal'
import { useI18n } from '#imports'
import { shownLabel } from '../app/utils/labels'
import { useKeptEntry } from '../app/composables/useKeptEntry'
import { localDraftKey, writeLocalDraft } from '../app/composables/useLocalDraft'
import EntryPage from '../app/pages/s/[site]/all/[brick]/[entry].vue'

const { computed, defineComponent, h, onMounted, ref, shallowRef, Suspense, watch } = vue
Object.entries({ computed, onMounted, ref, shallowRef, watch, useI18n, useKeptEntry, shownLabel }).forEach(([name, fn]) => vi.stubGlobal(name, fn))

const schema = serializeSchema(defineSite({
  site: 'restaurant', name: 'Restaurant', url: 'https://restaurant.test', timeZone: 'Europe/Vienna', locales: ['de'], currency: 'EUR',
  pages: { home: { de: '/' } },
  bricks: { dishes: collection({ label: 'Gerichte', max: 500, order: 'manual', fields: { title: f.text('Name') } }) },
}))
const brick = schema.bricks.dishes!

vi.stubGlobal('definePageMeta', () => {})
vi.stubGlobal('useHead', () => {})
vi.stubGlobal('useRoute', () => ({ params: { site: 'restaurant', brick: 'dishes', entry: 'e1' }, query: {} }))
vi.stubGlobal('useStudioSite', () => ({ shown: (label: string) => label }))
vi.stubGlobal('useConvexAuth', () => ({ user: ref({ id: 'u1' }) }))
vi.stubGlobal('useSiteData', async () => ({ slug: ref('restaurant'), schema: ref(schema), site: ref({ slug: 'restaurant' }), main: ref('de') }))
vi.stubGlobal('allAccess', () => ({ editable: computed(() => [['dishes', brick]]), tasksFor: () => ({ all: true }) }))
// entries.get answers a removed entry with `deleted` (the trash still holds it).
vi.stubGlobal('useConvexQuery', () => ({ data: ref({ _id: 'e1', brick: 'dishes', rev: 4, lifeRev: 2, deleted: true, state: 'live', data: { title: { de: 'Saibling' } } }), error: ref() }))

// Wrong behaviour caught: after a reload the page said only "Diesen Eintrag gibt es nicht (mehr)." and hid the
// unsaved input this browser still held for the removed entry; only the live case offered to restore or copy it out.
test('a removed entry opened again with unsaved input in this browser opens in the editor as removed', async () => {
  writeLocalDraft(localDraftKey('restaurant', 'u1', 'e1'), { v: 1, savedAt: Date.now(), baseRev: 4, locale: 'de', fields: { title: { de: 'Saibling gebeizt' } } })
  const wrapper = mount(defineComponent({ render: () => h(Suspense, null, { default: () => h(EntryPage) }) }), {
    global: { stubs: { AllShell: { template: '<div><slot /></div>' }, EntryEditor: { name: 'EntryEditor', props: ['entry', 'removed'], template: '<div />' } } },
  })
  await flushPromises()
  expect(wrapper.text()).not.toContain('Diesen Eintrag gibt es nicht (mehr).')
  const editor = wrapper.findComponent({ name: 'EntryEditor' })
  expect(editor.props('removed')).toBe(true)
  expect(editor.props('entry')).toMatchObject({ _id: 'e1', deleted: true })
})
