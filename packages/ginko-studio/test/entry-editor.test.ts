// @vitest-environment happy-dom
// Alles bearbeiten for a new entry: the publish panel asks about the entry as typed, also before its first save.
// The form engine and the German catalog are the real ones; Nuxt's auto-imports become globals, Convex, the
// writes and the field components are replaced.
import { flushPromises, mount } from '@vue/test-utils'
import * as vue from 'vue'
import { expect, test, vi } from 'vitest'
import { collection, defineSite, f, single } from '@lupinum/ginko'
import { serializeSchema } from '@lupinum/ginko/internal'
import { useI18n } from '#imports'
import { TRANSLATION } from '@lupinum/ginko-editor'
import { useEntryForm } from '../app/composables/useEntryForm'
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

// Wrong behaviour caught: a new draft is asked about by a generic name (the old "Neuer Eintrag" heading), or by its brick label "Blog" while empty.
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

const site = { slug: 'restaurant', url: 'https://restaurant.test', previewOrigins: [], schemaRev: 1, contentRev: 1, name: 'Restaurant' }
/** useConvexQuery that answers `name` with `data` (once its arguments are not 'skip'), and every other query with nothing. */
function answering(name: string, data: vue.Ref<unknown>, asked: unknown[] = []) {
  return (query: unknown, args: unknown) => {
    const value = typeof args === 'function' ? args() : args
    if (String(query) !== name || value === 'skip') return { data: ref(undefined), error: ref(undefined) }
    asked.push(value)
    return { data, error: ref(undefined) }
  }
}

// Wrong behaviour caught (J9, romi-13): Alles bearbeiten opened a new post empty and titled "Neuer Eintrag", while the
// task sheet started with today's date, so the first save failed on the required date. A late prefill must not wipe
// what the person typed meanwhile, and with several create tasks the general one counts: else every new notice of the
// gastro preset opened as "Heute ausgebucht" with that day's date.
test('a new entry starts like its create task: the task title and the prefill the server resolves', async () => {
  const blog = (tasks: NonNullable<Parameters<typeof collection>[0]['tasks']>) => serializeSchema(defineSite({
    site: 'restaurant', name: 'Restaurant', url: 'https://restaurant.test', timeZone: 'Europe/Vienna', locales: ['de'], currency: 'EUR',
    pages: { home: { de: '/' } },
    bricks: { blog: collection({ label: 'Blog', max: 50, order: 'manual', tasks, fields: { title: f.text('Titel'), date: f.date('Datum') } }) },
  }))
  const posts = blog([{ id: 'write', label: 'Beitrag schreiben', kind: 'create', prefill: { date: '@today' } }])
  const open = (schema: ReturnType<typeof blog>) => mount(EntryEditor, {
    props: { site, schema, brickKey: 'blog', brick: schema.bricks.blog!, canRemove: false },
    global: { stubs: { EntryFields: true, PreviewPane: true, NuxtLink: true } },
  })
  const prefill = ref<unknown>(undefined)
  const asked: unknown[] = []
  vi.stubGlobal('useConvexQuery', answering('tasks.prefill', prefill, asked))
  try {
    const wrapper = open(posts)
    expect(wrapper.get('h1').text()).toBe('Beitrag schreiben')
    expect(asked).toEqual([{ site: 'restaurant', task: 'blog.write' }])
    // The answer arrives after the form opened.
    prefill.value = { date: '2026-10-15' }
    await flushPromises()
    expect(wrapper.findComponent({ name: 'EntryFields' }).props('draft')).toEqual({ date: '2026-10-15' })

    // Typed before the answer arrived: the input stays.
    prefill.value = undefined
    const typed = open(posts)
    typed.findComponent({ name: 'EntryFields' }).vm.$emit('update', 'title', { de: 'Herbst' })
    prefill.value = { date: '2026-10-15' }
    await flushPromises()
    expect(typed.findComponent({ name: 'EntryFields' }).props('draft')).toEqual({ title: { de: 'Herbst' } })

    asked.length = 0
    const several = open(blog([
      { id: 'soldOut', label: 'Heute ausgebucht', kind: 'create', prefill: { title: 'Heute ausgebucht', date: '@today' } },
      { id: 'write', label: 'Beitrag schreiben', kind: 'create' },
    ]))
    expect(several.get('h1').text()).toBe('Beitrag schreiben')
    expect(asked).toEqual([{ site: 'restaurant', task: 'blog.write' }])
  } finally {
    vi.stubGlobal('useConvexQuery', () => ({ data: ref(undefined), error: ref(undefined) }))
  }

  // Without a create task the heading names the area.
  const plain = mount(EntryEditor, {
    props: { site, schema, brickKey: 'blog', brick: schema.bricks.blog!, canRemove: false },
    global: { stubs: { EntryFields: true, PreviewPane: true, NuxtLink: true } },
  })
  expect(plain.get('h1').text()).toBe('Neu in Blog')
})

// Wrong behaviour caught (A13): closing "Mehr" › "Eintrag entfernen …" with Escape sent the focus to the start of the
// page (reka returns it to the menu item, which left with the menu), and a keyboard user tabbed some 20 stops back.
test('closing the remove question returns the focus to "Mehr"', async () => {
  // reka-ui positions the menu with it; happy-dom has none.
  globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as never
  const entry = { _id: 'e1', brick: 'blog', kind: 'item', order: 1, rev: 1, lifeRev: 1, fieldRevs: {}, prints: {}, data: { title: { de: 'Herbstfest' } } }
  const wrapper = mount(EntryEditor, {
    props: { site: { slug: 'restaurant', url: 'https://restaurant.test', previewOrigins: [], schemaRev: 1, contentRev: 1, name: 'Restaurant' }, schema, brickKey: 'blog', brick: schema.bricks.blog!, entry, canRemove: true },
    global: { stubs: { EntryFields: true, PreviewPane: true, NuxtLink: true } },
    attachTo: document.body,
  })
  const more = wrapper.findAll('button').find((b) => b.text() === 'Mehr')!
  ;(more.element as HTMLElement).focus()
  await more.trigger('keydown', { key: 'Enter' })
  await flushPromises()
  ;[...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find((i) => i.textContent?.startsWith('Eintrag entfernen'))!.click()
  await flushPromises()
  expect(document.querySelector('[role="dialog"]')?.textContent).toContain('Eintrag entfernen')

  document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
  await flushPromises()
  expect(document.querySelector('[role="dialog"]')).toBeNull()
  expect(document.activeElement).toBe(more.element)
  wrapper.unmount()
})

// Wrong behaviour caught (Astra 11): a row someone removed meanwhile still had its translation confirmed with "Englisch stimmt noch",
// and the save named a text that no longer exists, which the server refuses (leafNotTranslatable): nothing saved.
test('a confirmed translation of a row removed meanwhile is left out of the save', async () => {
  const bilingual = serializeSchema(defineSite({
    site: 'restaurant', name: 'Restaurant', url: 'https://restaurant.test', timeZone: 'Europe/Vienna', locales: ['de', 'en'], currency: 'EUR',
    pages: { home: { de: '/', en: '/en' } },
    bricks: { lunch: single({ label: 'Mittagsmenü', fields: { days: f.list('Tage', { itemLabel: 'Tag', max: 5, fields: { dish: f.text('Gericht') } }) } }) },
  }))
  const day = (id: string, de: string) => ({ _id: id, dish: { de, en: 'Soup' } })
  const entry = (rev: number, days: unknown[]) => ({ _id: 'l1', brick: 'lunch', kind: 'single', order: 0, rev, lifeRev: 1, fieldRevs: { days: rev }, prints: {}, data: { days } })
  const saveEntry = vi.fn(async () => ({ rev: 3 }))
  vi.stubGlobal('useOps', () => ({ opId: () => 'op1', saveEntry }))
  vi.stubGlobal('useRoute', () => ({ query: { lang: 'en' } }))
  // The fields: "Englisch stimmt noch" on both rows' dish, as GinkoField offers it in the English view.
  const Fields = vue.defineComponent({
    setup: () => {
      const translation = inject(TRANSLATION)!
      return () => vue.h('div', ['days.d1.dish', 'days.d2.dish'].map((leaf) => vue.h('button', { type: 'button', 'data-leaf': leaf, onClick: () => translation.confirm!(leaf) }, 'Englisch stimmt noch')))
    },
  })
  try {
    const wrapper = mount(EntryEditor, {
      props: { site: { slug: 'restaurant', url: 'https://restaurant.test', previewOrigins: [], schemaRev: 1, contentRev: 1, name: 'Restaurant' }, schema: bilingual, brickKey: 'lunch', brick: bilingual.bricks.lunch!, entry: entry(1, [day('d1', 'Suppe'), day('d2', 'Brühe')]), canRemove: false },
      global: { stubs: { EntryFields: Fields, PreviewPane: true, NuxtLink: true } },
    })
    for (const button of wrapper.findAll('button[data-leaf]')) await button.trigger('click')
    // Someone removes the first day meanwhile.
    await wrapper.setProps({ entry: entry(2, [day('d2', 'Brühe')]) })
    await flushPromises()
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(saveEntry).toHaveBeenCalledTimes(1)
    expect((saveEntry.mock.calls[0] as unknown as [{ confirm?: string[] }])[0].confirm).toEqual(['days.d2.dish'])
  } finally {
    vi.stubGlobal('useOps', () => ({}))
    vi.stubGlobal('useRoute', () => ({ query: {} }))
  }
})
