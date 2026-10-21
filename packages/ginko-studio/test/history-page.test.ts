// @vitest-environment happy-dom
// Verlauf: the page of one entry's history. The German catalog is the real one; Nuxt's auto-imports become globals,
// Convex is replaced.
import { flushPromises, mount } from '@vue/test-utils'
import { ConvexError } from 'convex/values'
import { normalizeConvexError } from '@lupinum/better-convex-nuxt/errors'
import * as vue from 'vue'
import { describe, expect, test, vi } from 'vitest'
import { collection, defineSite, f } from '@lupinum/ginko'
import { serializeSchema } from '@lupinum/ginko/internal'
import { useI18n } from '#imports'
import HistoryPage from '../app/pages/s/[site]/history/index.vue'
import ChangeDiff from '../app/components/ChangeDiff.vue'
import ChangeRows from '../app/components/ChangeRows.vue'
import StudioPage from '../app/components/StudioPage.vue'

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
/** What each Convex query answers, by name (the test API shim names them, e.g. "entries.get"), and the ones that fail. */
const answers: Record<string, unknown> = { 'entries.get': { _id: 'e1', brick: 'legal', data: { title: { de: 'Datenschutzerklärung' } } } }
const failures: Record<string, unknown> = {}
/** The arguments each query was last asked with. */
const asked: Record<string, unknown> = {}
vi.stubGlobal('useConvexQuery', (query: unknown, args: () => unknown) => ({
  data: computed(() => { asked[String(query)] = args(); return args() === 'skip' ? undefined : answers[String(query)] }),
  error: computed(() => (args() === 'skip' ? undefined : failures[String(query)])),
}))
/** The rows of the history list. */
const changes = ref<unknown[]>([])
vi.stubGlobal('useConvexPaginatedQuery', () => ({ data: changes, status: ref('success'), error: ref(), canLoadMore: ref(false), isLoadingMore: ref(false), loadMore: () => {} }))
vi.stubGlobal('useOps', () => ({}))
/** The row menu ("Weitere Aktionen") renders its items in place, as buttons, or as their link. */
const pass = { template: '<div><slot /></div>' }
const menu = {
  DropdownMenu: pass, DropdownMenuTrigger: pass, DropdownMenuContent: pass,
  DropdownMenuItem: { props: ['asChild'], emits: ['select'], template: '<slot v-if="asChild" /><button v-else type="button" @click="$emit(\'select\')"><slot /></button>' },
}

// Wrong behaviour caught: "Verlauf dieses Eintrags" opened a page titled only "Verlauf", with no way back, and an
// entry nobody changed since the import said "Keine Änderungen für diesen Filter.", so the owner thought it was broken.
test('the history of one entry names it, links back to it and says plainly that nothing was changed yet', async () => {
  const wrapper = mount(defineComponent({ render: () => h(Suspense, null, { default: () => h(HistoryPage) }) }), {
    global: {
      components: { ChangeRows, StudioPage },
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
  const wrapper = mount(ChangeRows, { props: { site: 'restaurant', schema, manager: true, grants: new Set<string>(), filter: 'entry', entry: 'e1' }, global: { components: { ChangeDiff }, stubs: { ...menu, ChangeDetail: true, NuxtLink: true } } })
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
  const wrapper = mount(ChangeRows, { props: { site: 'restaurant', schema, manager: true, grants: new Set<string>() }, global: { stubs: { ...menu, ChangeDetail: true, NuxtLink: { props: ['to'], template: '<a :href="to"><slot /></a>' } } } })
  const rows = wrapper.findAll('li')
  expect(rows.map((row) => row.findAll('a').map((a) => [a.text(), a.attributes('href')]))).toEqual([[['Papierkorb öffnen', '/s/restaurant/all?removed']], []])
})

// Wrong behaviour caught: going back to the version that is already current offered a button that saves nothing; a
// failed lookup asked to go back without showing what that changes. A creation (the entry as it was made) could
// not be gone back to at all.
describe('going back to a version', () => {
  const row = (kind: string, fields?: string[]) => ({ _id: 'c2', kind, entry: 'e1', brick: 'legal', ...(fields ? { fields } : {}), at: Date.UTC(2026, 9, 8, 10), msg: null, sentence: 'x', who: { email: 'anna@example.test' }, agent: null, undoBlocked: null, inTrash: false })
  const open = (manager = true) => mount(ChangeRows, { props: { site: 'restaurant', schema, manager, grants: new Set<string>(), filter: 'entry', entry: 'e1' }, global: { components: { ChangeDiff }, stubs: { ...menu, ChangeDetail: true, NuxtLink: true } } })
  const buttons = (el: { findAll: (s: string) => { text: () => string; attributes: (name: string) => string | undefined }[] }) => el.findAll('button').map((b) => b.text() || b.attributes('aria-label'))

  test.each([
    ['is the current one', { change: 'c2', diff: [] }, undefined, 'Das ist schon der aktuelle Stand.'],
    ['cannot be read', undefined, normalizeConvexError(new ConvexError({ code: 'NOT_FOUND', key: 'errors.versionNotFound', message: 'Diese Version gibt es nicht mehr.' }), { functionName: 'entries:versionAt' }), 'Diese Version gibt es nicht (mehr).'],
  ])('that %s offers no button to go back', async (_name, answer, failure, text) => {
    changes.value = [row('save', ['title'])]
    answers['entries.versionAt'] = answer
    failures['entries.versionAt'] = failure
    try {
      const wrapper = open()
      await wrapper.findAll('button').find((b) => b.text() === 'Zurück zu dieser Version')!.trigger('click')
      const question = wrapper.get('[role="group"]')
      expect(question.text()).toContain(text)
      expect(question.find('[role="alert"]').exists()).toBe(!!failure)
      expect(buttons(question)).toEqual(['Abbrechen'])
    } finally {
      delete failures['entries.versionAt']
    }
  })

  // Wrong behaviour caught: the preview was read without the task the revert uses, so staff on the weekly lunch task saw
  // the week change in the preview that the save does not make.
  test('the preview is asked for with the task the revert will use', async () => {
    const withTasks = serializeSchema(defineSite({
      site: 'restaurant', name: 'Restaurant', url: 'https://restaurant.test', timeZone: 'Europe/Vienna', locales: ['de'], currency: 'EUR',
      pages: { home: { de: '/' } },
      bricks: { legal: collection({ label: 'Rechtliches', max: 10, order: 'manual', fields: { title: f.text('Titel') }, tasks: [{ id: 'fix', label: 'Titel', kind: 'edit', fields: ['title'] }] }) },
    }))
    changes.value = [row('save', ['title'])]
    answers['entries.versionAt'] = { change: 'c2', diff: [] }
    const taskOf = (manager: boolean) => (mount(ChangeRows, { props: { site: 'restaurant', schema: withTasks, manager, grants: new Set(['legal.fix']), filter: 'entry', entry: 'e1' }, global: { components: { ChangeDiff }, stubs: { ...menu, ChangeDetail: true, NuxtLink: true } } }))
    const staff = taskOf(false)
    await staff.findAll('button').find((b) => b.text() === 'Zurück zu dieser Version')!.trigger('click')
    expect(asked['entries.versionAt']).toEqual({ site: 'restaurant', task: 'legal.fix', entry: 'e1', change: 'c2' })
    const owner = taskOf(true)
    await owner.findAll('button').find((b) => b.text() === 'Zurück zu dieser Version')!.trigger('click')
    expect(asked['entries.versionAt']).toEqual({ site: 'restaurant', entry: 'e1', change: 'c2' })
  })

  // Wrong behaviour caught: a save that cannot be undone ("Changed again since. Go back to an earlier version instead.")
  // hid the way back in the unlabelled menu. It shows as a button in the Undo slot; other rows keep it in the menu.
  test.each([
    ['changed', ['Änderungen anzeigen', 'Zurück zu dieser Version']],
    [null, ['Änderungen anzeigen', 'Rückgängig', 'Weitere Aktionen', 'Zurück zu dieser Version']],
  ])('going back sits beside the row, not in the menu, when the undo is blocked (%s)', (undoBlocked, shown) => {
    changes.value = [{ ...row('save', ['title']), undoBlocked }]
    expect(buttons(open())).toEqual(shown)
  })

  test.each([
    [true, ['Weitere Aktionen', 'Zurück zu dieser Version']],
    // Staff edit through tasks of named fields; a creation names none, so no task can be checked against it.
    [false, []],
  ])('a creation can be gone back to by owners and admins (manager: %s)', (manager, shown) => {
    changes.value = [row('create')]
    expect(buttons(open(manager))).toEqual(shown)
  })
})
