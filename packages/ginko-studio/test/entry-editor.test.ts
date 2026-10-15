// @vitest-environment happy-dom
// Alles bearbeiten for a new entry: the publish panel asks about the entry as typed, also before its first save.
// The form engine and the German catalog are the real ones; Nuxt's auto-imports become globals, Convex, the
// writes and the field components are replaced.
import { flushPromises, mount } from '@vue/test-utils'
import * as vue from 'vue'
import { expect, test, vi } from 'vitest'
import { collection, defineSite, f } from '@lupinum/ginko'
import { serializeSchema } from '@lupinum/ginko/internal'
import { useI18n } from '#imports'
import { useEntryForm } from '../app/composables/useEntryForm'
import { allAccess } from '../app/composables/useAll'
import EntryEditor from '../app/components/EntryEditor.vue'
import PreviewPane from '../app/components/PreviewPane.vue'

const { computed, inject, nextTick, onBeforeUnmount, onMounted, provide, reactive, ref, watch } = vue
Object.entries({ computed, inject, nextTick, onBeforeUnmount, onMounted, provide, reactive, ref, watch, useI18n, useEntryForm }).forEach(([name, fn]) => vi.stubGlobal(name, fn))
vi.stubGlobal('useRoute', () => ({ query: {} }))
vi.stubGlobal('onBeforeRouteLeave', () => {})
vi.stubGlobal('onBeforeRouteUpdate', () => {})
vi.stubGlobal('useToast', () => ({ show: () => {} }))
vi.stubGlobal('useConvexQuery', () => ({ data: ref(undefined), error: ref(undefined) }))
vi.stubGlobal('useConvexMutation', () => ({ mutate: async () => ({}) }))
vi.stubGlobal('useConvexAuth', () => ({ user: ref({ id: 'u1' }) }))
vi.stubGlobal('useConvexConnectionState', () => ({ isConnected: ref(true) }))
// Nothing is saved here: the writes are never called.
vi.stubGlobal('useOps', () => ({}))

const schema = serializeSchema(defineSite({
  site: 'restaurant', name: 'Restaurant', url: 'https://restaurant.test', timeZone: 'Europe/Vienna', locales: ['de'], currency: 'EUR',
  pages: { home: { de: '/' } },
  bricks: { blog: collection({ label: 'Blog', drafts: true, max: 50, order: 'manual', fields: { title: f.text('Titel'), body: f.longtext('Text', { optional: true }) } }) },
}))

// Wrong behaviour caught: a new draft is asked about as "Neuer Eintrag" (the page heading), or by its brick label "Blog" while empty.
test('a never saved draft is asked about by the title typed so far', async () => {
  const wrapper = mount(EntryEditor, {
    props: { site: { slug: 'restaurant', url: 'https://restaurant.test', previewOrigins: [], schemaRev: 1, contentRev: 1, name: 'Restaurant' }, schema, brickKey: 'blog', brick: schema.bricks.blog!, canRemove: false },
    global: { stubs: { EntryFields: true, PreviewPane: true, NuxtLink: true } },
  })
  await wrapper.findAll('button').find((b) => b.text() === 'Veröffentlichen …')!.trigger('click')
  expect(wrapper.get('#publish-title').text()).toBe('Wann soll der Eintrag online gehen?')

  wrapper.findComponent({ name: 'EntryFields' }).vm.$emit('update', 'title', { de: 'Herbstfest' })
  await flushPromises()
  expect(wrapper.get('#publish-title').text()).toBe('Wann soll „Herbstfest“ online gehen?')
})

// Wrong behaviour caught: the entry limit spans all fields and languages, so no field counter shows it and the
// person learns of it only when Save is refused. Just over or under the limit, rounding said "480 KB von 480 KB" (volume-6).
test.each([
  { body: 500 * 1024 - 100, text: 'Dieser Eintrag ist zu groß: 500 KB von 480 KB. Kürze ihn um etwa 20 KB, dann lässt er sich speichern.' },
  // A few bytes over (the form's other bytes are fewer than 40).
  { body: 480 * 1024 - 19, text: 'Dieser Eintrag ist zu groß: 481 KB von 480 KB. Kürze ihn um etwa 1 KB, dann lässt er sich speichern.' },
  // A few bytes under.
  { body: 480 * 1024 - 60, text: 'Dieser Eintrag belegt 479 KB von 480 KB.' },
])('the save bar says how full the entry is near the limit and how much to cut over it ($body bytes of text)', async ({ body, text }) => {
  vi.useFakeTimers()
  try {
    const wrapper = mount(EntryEditor, {
      props: { site: { slug: 'restaurant', url: 'https://restaurant.test', previewOrigins: [], schemaRev: 1, contentRev: 1, name: 'Restaurant' }, schema, brickKey: 'blog', brick: schema.bricks.blog!, canRemove: false },
      global: { stubs: { EntryFields: true, PreviewPane: true, NuxtLink: true } },
    })
    wrapper.findComponent({ name: 'EntryFields' }).vm.$emit('update', 'body', { de: 'x'.repeat(body) })
    await vi.advanceTimersByTimeAsync(300)
    expect(wrapper.get('.bar p').text()).toBe(text)
  } finally {
    vi.useRealTimers()
  }
})

// Wrong behaviour caught: the preview shows the site without its entries while they are still loading.
test('the preview sends the site only once its entries have loaded', async () => {
  vi.useFakeTimers()
  try {
    const entries = ref<unknown[] | undefined>(undefined)
    vi.stubGlobal('useConvexQuery', () => ({ data: entries, error: ref(undefined) }))
    const wrapper = mount(EntryEditor, {
      props: { site: { slug: 'restaurant', url: 'https://restaurant.test', previewOrigins: [], schemaRev: 1, contentRev: 1, name: 'Restaurant' }, schema, brickKey: 'blog', brick: schema.bricks.blog!, canRemove: false },
      global: { stubs: { EntryFields: true, NuxtLink: true }, components: { PreviewPane } },
    })
    await wrapper.findAll('button').find((b) => b.text() === 'Vorschau')!.trigger('click')
    // Not attached, so nothing loads the site; the frame's window is a stand-in that records what it is sent.
    const frame = wrapper.get('iframe').element
    const source = new MessageChannel().port1
    const post = vi.spyOn(source, 'postMessage').mockImplementation(() => {})
    Object.defineProperty(frame, 'contentWindow', { value: source })
    const session = new URL(frame.getAttribute('src')!).searchParams.get('session')
    window.dispatchEvent(new MessageEvent('message', { source, origin: 'https://restaurant.test', data: { type: 'ginko:ready', session } }))
    await vi.advanceTimersByTimeAsync(300)
    expect(post).not.toHaveBeenCalled()

    entries.value = []
    await vi.advanceTimersByTimeAsync(300)
    expect(post).toHaveBeenCalledTimes(1)
  } finally {
    vi.useRealTimers()
    vi.stubGlobal('useConvexQuery', () => ({ data: ref(undefined), error: ref(undefined) }))
  }
})

// Wrong behaviour caught: staff without a right to change an entry opened it and saw only the title, a dead Speichern and
// no word why, so it looked as if the text was deleted (J2).
test.each([
  {
    held: [{ id: 'write', label: 'Beitrag schreiben', kind: 'create' as const }], create: 'blog.write',
    note: 'Diesen Eintrag kannst du nicht ändern: Hier änderst du nur Einträge, die du selbst angelegt hast. Muss hier etwas geändert werden, frag die Person, die dich eingeladen hat.',
  },
  {
    held: [{ id: 'remove', label: 'Beitrag entfernen', kind: 'remove' as const }], create: undefined,
    note: 'Diesen Eintrag kannst du nicht ändern. Deine Rechte in „Blog“: Beitrag entfernen. Muss hier etwas geändert werden, frag die Person, die dich eingeladen hat.',
  },
])('staff who may not change an entry see why and whom to ask, and no Speichern ($held.0.id)', async ({ held, create, note }) => {
  const entry = { _id: 'e1', brick: 'blog', kind: 'item' as const, order: 1, data: { title: { de: 'Herbstfest' } }, rev: 1, fieldRevs: {}, lifeRev: 1, prints: {}, state: 'live' as const }
  const wrapper = mount(EntryEditor, {
    props: {
      site: { slug: 'restaurant', url: 'https://restaurant.test', previewOrigins: [], schemaRev: 1, contentRev: 1, name: 'Restaurant' }, schema, brickKey: 'blog', brick: schema.bricks.blog!, entry,
      tasks: { save: undefined, fields: [], create, held }, canRemove: false,
    },
    global: { stubs: { EntryFields: true, PreviewPane: true, NuxtLink: true } },
  })
  await flushPromises()
  expect(wrapper.get('[role="status"]').text()).toBe(note)
  expect(wrapper.find('button[type="submit"]').exists()).toBe(false)
})

// Wrong behaviour caught: on an entry they created, staff who also hold an edit task saved every change through the
// create task, so a typo fix waited for approval when only the create task needs it (the agent door saved it
// directly through the edit task).
test('staff save an entry they created through the edit task that covers the change, and through the create task otherwise', async () => {
  const brick = { ...schema.bricks.blog!, tasks: [
    { id: 'write', label: 'Beitrag schreiben', kind: 'create' as const, needsApproval: true },
    { id: 'title', label: 'Titel ändern', kind: 'edit' as const, fields: ['title'] },
  ] }
  const { tasksFor } = allAccess({ isManager: ref(false), bricks: ref([['blog', brick]]), may: () => true } as never)
  const sent: (string | undefined)[] = []
  vi.stubGlobal('useOps', () => ({ opId: () => `op${sent.length}`, saveEntry: async ({ task }: { task?: string }) => ({ rev: sent.push(task) + 1 }) }))
  try {
    const entry = { _id: 'e1', brick: 'blog', kind: 'item' as const, order: 1, data: { title: { de: 'Herbstfest' } }, rev: 1, fieldRevs: {}, lifeRev: 1, prints: {}, state: 'live' as const, own: true }
    const wrapper = mount(EntryEditor, {
      props: {
        site: { slug: 'restaurant', url: 'https://restaurant.test', previewOrigins: [], schemaRev: 1, contentRev: 1, name: 'Restaurant' }, schema, brickKey: 'blog', brick, entry,
        tasks: tasksFor('blog', brick, entry), canRemove: false,
      },
      global: { stubs: { EntryFields: true, PreviewPane: true, NuxtLink: true } },
    })
    await flushPromises()
    for (const [field, value] of [['title', 'Herbstfest am 26.'], ['body', 'Mit Musik.']] as const) {
      wrapper.findComponent({ name: 'EntryFields' }).vm.$emit('update', field, { de: value })
      await wrapper.get('form').trigger('submit')
      await flushPromises()
    }
    expect(sent).toEqual(['blog.title', 'blog.write'])
  } finally {
    vi.stubGlobal('useOps', () => ({}))
  }
})
