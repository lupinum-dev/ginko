// @vitest-environment happy-dom
// The docs navigation tree (NavTree): what it shows and which move it sends. The German catalog is the real one;
// Nuxt's auto-imports become globals, Convex is replaced by the rows below, the write by a spy.
import { flushPromises, mount } from '@vue/test-utils'
import * as vue from 'vue'
import { afterEach, expect, test, vi } from 'vitest'
import { collection, defineSite, f } from '@lupinum/ginko'
import { serializeSchema, type CollectionBrick } from '@lupinum/ginko/internal'
import { useI18n } from '#imports'
import NavTree from '../app/components/NavTree.vue'

const { computed, nextTick, ref, watch } = vue
Object.entries({ computed, nextTick, ref, watch, useI18n }).forEach(([name, fn]) => vi.stubGlobal(name, fn))

const brick = serializeSchema(defineSite({
  site: 'docs', name: 'Docs', url: 'https://docs.test', timeZone: 'Europe/Vienna', locales: ['de'], currency: 'EUR', pages: {},
  bricks: { docs: collection({ label: 'Doku', max: 100, order: 'manual', fields: { title: f.text('Titel'), section: f.text('Abschnitt', { optional: true }), parent: f.ref('Über', { to: 'docs', optional: true }), slug: f.slug('Adresse', { from: 'title' }) } }) },
})).bricks.docs as CollectionBrick

type Row = { _id: string; rev?: number; state?: string; parent?: string; section?: string }
const data = ref<unknown>()
const pages = (rows: Row[]) => {
  data.value = rows.map((r) => ({
    _id: r._id, rev: r.rev ?? 3, state: r.state ?? 'live', publishAt: null, title: r._id, navTitle: null, badge: null,
    parent: r.parent ?? null, section: r.section ?? null, tab: null, sectionLabel: r.section ?? null, tabLabel: null,
  }))
}
const placeEntry = vi.fn(async () => true)
vi.stubGlobal('useConvexQuery', () => ({ data, error: ref() }))
vi.stubGlobal('useOps', () => ({ placeEntry, setHeading: vi.fn() }))
vi.stubGlobal('useToast', () => ({ show: vi.fn() }))
vi.stubGlobal('useRoute', () => ({ query: {} }))
vi.stubGlobal('navigateTo', vi.fn())
const mounted: { unmount: () => void }[] = []
afterEach(() => { placeEntry.mockClear(); mounted.splice(0).forEach((w) => w.unmount()) })

const view = async (rows: Row[]) => {
  pages(rows)
  const wrapper = mount(NavTree, {
    props: { slug: 'docs', brickKey: 'docs', brick, canArrange: true, canCreate: true, language: 'de' },
    global: { stubs: { NuxtLink: { inheritAttrs: true, template: '<a><slot /></a>' } } },
    attachTo: document.body,
  })
  mounted.push(wrapper)
  await flushPromises()
  return wrapper
}
const order = (wrapper: Awaited<ReturnType<typeof view>>) => wrapper.findAll('[data-tree-row]').map((r) => r.attributes('data-tree-row'))
const alt = (wrapper: Awaited<ReturnType<typeof view>>, id: string, key: string) => wrapper.find(`[data-tree-link="${id}"]`).trigger('keydown', { key, altKey: true })

// Wrong behaviour caught: the tree shows the stored list instead of the website, so a page nested under one of another
// section appears in the wrong section, and a live page whose parent is still a draft (top level on the website) looks fine.
test('shows pages where the website shows them and flags a live page under a draft parent', async () => {
  const wrapper = await view([
    { _id: 'intro', section: 'Start' }, { _id: 'errors' }, { _id: 'auth', section: 'Anleitungen' },
    { _id: 'budget', parent: 'errors' }, { _id: 'limits', state: 'draft' }, { _id: 'rate', parent: 'limits' },
  ])
  expect(order(wrapper)).toEqual(['intro', 'errors', 'budget', 'auth', 'limits', 'rate'])
  expect(wrapper.findAll('h3').map((h) => h.text())).toEqual(['Start', 'Anleitungen'])
  expect(wrapper.find('[data-tree-row="rate"]').text()).toContain('Auf der Website auf der obersten Ebene, bis „limits“ veröffentlicht ist.')
  expect(wrapper.find('[data-tree-row="budget"]').text()).not.toContain('Steht woanders')
})

// Wrong behaviour caught: Alt+↓ on the last page of a section swaps it behind the next heading's first page instead of
// making it the first page under that heading, sends a stale revision, or Undo puts it somewhere else.
test('Alt+↓ on the last page of a section makes it first under the next heading; Undo puts it back', async () => {
  const wrapper = await view([{ _id: 'intro', section: 'Start' }, { _id: 'setup', rev: 7 }, { _id: 'auth', section: 'Anleitungen' }, { _id: 'paging' }])
  await alt(wrapper, 'setup', 'ArrowDown')
  expect(placeEntry).toHaveBeenCalledWith('setup', 7, { before: 'auth' }, expect.objectContaining({ message: '„setup“ ist jetzt in „Anleitungen“.' }))
  const undo = (placeEntry.mock.calls[0] as unknown as [string, number, unknown, { undo: () => Promise<void> }])[3].undo
  pages([{ _id: 'intro', section: 'Start' }, { _id: 'setup', rev: 8, section: 'Anleitungen' }, { _id: 'auth' }, { _id: 'paging' }])
  await flushPromises()
  await undo()
  expect(placeEntry).toHaveBeenLastCalledWith('setup', 8, { after: 'intro' })
})

// Wrong behaviour caught: moving the only page under a heading silently removes that heading from the website.
test('moving the only page under a heading asks first and moves only after the yes', async () => {
  const wrapper = await view([{ _id: 'a', section: 'Start' }, { _id: 'b' }, { _id: 'c', section: 'Mehr' }])
  await alt(wrapper, 'c', 'ArrowUp')
  await flushPromises()
  expect(placeEntry).not.toHaveBeenCalled()
  expect(document.body.textContent).toContain('„c“ ist die einzige Seite unter „Mehr“.')
  const yes = [...document.querySelectorAll('button')].find((b) => b.textContent?.includes('Verschieben und Überschrift entfernen'))!
  yes.click()
  await flushPromises()
  expect(placeEntry).toHaveBeenCalledWith('c', 3, { after: 'b' }, expect.anything())
})

// Wrong behaviour caught: dropping a page onto the middle of another puts it next to that page instead of inside it.
test('dropping onto the middle of a page puts the dragged page inside it, after its subpages', async () => {
  const wrapper = await view([{ _id: 'auth' }, { _id: 'keys', parent: 'auth' }, { _id: 'paging' }])
  const target = wrapper.find('[data-tree-row="auth"]')
  ;(target.element as HTMLElement).getBoundingClientRect = () => ({ top: 0, height: 40, bottom: 40, left: 0, right: 300, width: 300, x: 0, y: 0, toJSON: () => ({}) })
  // Collapsed, so the lower part of the row is "inside" too (an open row's lower part means its first subpage).
  await wrapper.find('[data-tree-row="auth"] button[tabindex="-1"]').trigger('click')
  await wrapper.find('[data-tree-row="paging"]').trigger('dragstart', { dataTransfer: { setData: () => {}, effectAllowed: '' } })
  await wrapper.find('[data-tree-row="auth"]').trigger('dragover', { clientX: 50, clientY: 20 })
  await wrapper.find('section > div.rounded-xl').trigger('drop')
  expect(placeEntry).toHaveBeenCalledWith('paging', 3, { parent: 'auth', after: 'keys' }, expect.anything())
})
