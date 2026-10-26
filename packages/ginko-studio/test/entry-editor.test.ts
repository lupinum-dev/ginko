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
import { allAccess } from '../app/composables/useAll'
import EntryEditor from '../app/components/EntryEditor.vue'
import PreviewPane from '../app/components/PreviewPane.vue'
import AppToast from '../app/components/AppToast.vue'
import { providePanelBar } from '../app/composables/usePageHeader'

const { computed, defineComponent, inject, nextTick, onBeforeUnmount, onMounted, provide, reactive, ref, watch } = vue
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
  bricks: { blog: collection({ label: 'Blog', drafts: true, max: 50, order: 'manual', fields: { title: f.text('Titel'), body: f.longtext('Text', { optional: true }), story: f.markdown('Geschichte', { optional: true }) } }) },
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

// Wrong behaviour caught: opened by a move within the Studio, the panel bar is already shown when the form sets up, and
// the form crashed reading its right column before the status card it depends on existed.
test('a draft entry opened with the panel bar already shown gets its right column', async () => {
  const wide = vi.spyOn(window, 'matchMedia').mockImplementation((query: string) => ({ matches: true, media: query, addEventListener: () => {}, removeEventListener: () => {} }) as unknown as MediaQueryList)
  const Shell = defineComponent({
    setup() {
      providePanelBar(() => true)
      const ready = ref(false)
      onMounted(() => { ready.value = true })
      return () => (ready.value ? vue.h(EntryEditor, { site: { slug: 'restaurant', url: 'https://restaurant.test', previewOrigins: [], schemaRev: 1, contentRev: 1, name: 'Restaurant' }, schema, brickKey: 'blog', brick: schema.bricks.blog!, canRemove: false }) : null)
    },
  })
  const wrapper = mount(Shell, { global: { stubs: { EntryFields: true, PreviewPane: true, NuxtLink: true } } })
  await flushPromises()
  expect(wrapper.find('aside.side-col').exists()).toBe(true)
  wrapper.unmount()
  wide.mockRestore()
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

// Wrong behaviour caught: while a save waited for the network, the bar said "Speichert …" next to "Nicht gespeichert"
// and nothing said the input was safe, so people clicked again or closed the tab.
test('a save on its way shows no "Nicht gespeichert"; without network the bar says the input is kept', async () => {
  let land!: () => void
  vi.stubGlobal('useOps', () => ({ opId: () => 'op1', createEntry: () => new Promise((resolve) => { land = () => resolve({ entry: 'e1' }) }) }))
  try {
    const wrapper = mount(EntryEditor, {
      props: { site: { slug: 'restaurant', url: 'https://restaurant.test', previewOrigins: [], schemaRev: 1, contentRev: 1, name: 'Restaurant' }, schema, brickKey: 'blog', brick: schema.bricks.blog!, canRemove: false },
      global: { stubs: { EntryFields: true, PreviewPane: true, NuxtLink: true } },
    })
    wrapper.findComponent({ name: 'EntryFields' }).vm.$emit('update', 'title', { de: 'Herbstfest' })
    await flushPromises()
    expect(wrapper.get('.bar').text()).toContain('Nicht gespeichert')

    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(wrapper.get('.bar').text()).toContain('Speichert …')
    expect(wrapper.get('.bar').text()).not.toContain('Nicht gespeichert')
    expect(wrapper.find('.bar [role="status"]').exists()).toBe(false)

    window.dispatchEvent(new Event('offline'))
    await flushPromises()
    expect(wrapper.get('.bar [type="submit"]').text()).toBe('Wartet auf Verbindung …')
    expect(wrapper.get('.bar [role="status"]').text()).toBe('Keine Verbindung. Deine Eingaben sind in diesem Browser gesichert. Lass diese Seite offen, dann wird gespeichert, sobald du wieder online bist.')
    window.dispatchEvent(new Event('online'))
    land()
    await flushPromises()
  } finally {
    vi.stubGlobal('useOps', () => ({}))
  }
})

// Wrong behaviour caught: Cmd/Ctrl+S in a changed form did nothing here, and in a browser it opened "Save page as".
test('Ctrl+S in the form saves a change once, and an unchanged form not at all', async () => {
  const saveEntry = vi.fn(async () => ({ rev: 2 }))
  vi.stubGlobal('useOps', () => ({ opId: () => 'op1', saveEntry }))
  try {
    const entry = { _id: 'e1', brick: 'blog', kind: 'item', order: 0, data: { title: { de: 'Alt' } }, rev: 1, fieldRevs: {}, lifeRev: 1, prints: {}, state: 'live' } as const
    const wrapper = mount(EntryEditor, {
      props: { site: { slug: 'restaurant', url: 'https://restaurant.test', previewOrigins: [], schemaRev: 1, contentRev: 1, name: 'Restaurant' }, schema, brickKey: 'blog', brick: schema.bricks.blog!, entry, canRemove: false },
      global: { stubs: { EntryFields: true, PreviewPane: true, NuxtLink: true } },
    })
    const pressSave = async () => {
      const event = new KeyboardEvent('keydown', { key: 's', ctrlKey: true, bubbles: true, cancelable: true })
      wrapper.get('form').element.dispatchEvent(event)
      await flushPromises()
      return event
    }
    expect((await pressSave()).defaultPrevented).toBe(true)
    expect(saveEntry).not.toHaveBeenCalled()

    wrapper.findComponent({ name: 'EntryFields' }).vm.$emit('update', 'title', { de: 'Neu' })
    await flushPromises()
    await pressSave()
    expect(saveEntry).toHaveBeenCalledTimes(1)
    expect(saveEntry.mock.calls[0]![0]).toMatchObject({ entry: 'e1', fields: { title: { de: 'Neu' } } })
  } finally {
    vi.stubGlobal('useOps', () => ({}))
  }
})

// Wrong behaviour caught: the toast after a save ("Gespeichert … Rückgängig") sat on top of the save bar, so the bar
// showed only "G…"; or it stayed up there after the editor closed.
test('while the editor is open the toast sits above its save bar, and goes back down when it closes', async () => {
  const Toaster = defineComponent({ name: 'Toaster', props: ['offset', 'mobileOffset'], render: () => null })
  // happy-dom lays nothing out: its observer reports the save bar 72px high, as a browser would (both boxes, since
  // the editor also measures its own content width).
  const observer = window.ResizeObserver
  window.ResizeObserver = class {
    constructor(private report: ResizeObserverCallback) {}
    observe(el: Element) {
      const blockSize = el.classList.contains('bar') ? 72 : 0
      const box = [{ inlineSize: 600, blockSize }]
      queueMicrotask(() => this.report([{ target: el, borderBoxSize: box, contentBoxSize: box, contentRect: { width: 600, height: blockSize } }] as never, this as never))
    }
    unobserve() {}
    disconnect() {}
  } as never
  try {
    const toast = mount(AppToast, { global: { components: { Toaster } } })
    const editor = mount(EntryEditor, {
      props: { site: { slug: 'restaurant', url: 'https://restaurant.test', previewOrigins: [], schemaRev: 1, contentRev: 1, name: 'Restaurant' }, schema, brickKey: 'blog', brick: schema.bricks.blog!, canRemove: false },
      global: { stubs: { EntryFields: true, PreviewPane: true, NuxtLink: true } },
    })
    await flushPromises()
    expect(toast.getComponent(Toaster).props()).toEqual({ offset: { bottom: '84px' }, mobileOffset: { bottom: '84px' } })

    editor.unmount()
    await flushPromises()
    // Back to the defaults: phones above the tab bar again.
    expect(toast.getComponent(Toaster).props()).toEqual({ offset: undefined, mobileOffset: { bottom: 'calc(4.75rem + env(safe-area-inset-bottom))' } })
  } finally {
    window.ResizeObserver = observer
  }
})

// Wrong behaviour caught: "Vorschau" on a new, unsaved post showed the site's first page (/ueber-uns), not the post,
// so the person thought the post was lost; on a collection without drafts saving publishes at once (romi-10, J7).
test('the preview of a new entry shows its own page once the title is typed, and says what it waits for until then', async () => {
  vi.useFakeTimers()
  try {
    const routed = serializeSchema(defineSite({
      site: 'restaurant', name: 'Restaurant', url: 'https://restaurant.test', timeZone: 'Europe/Vienna', locales: ['de'], currency: 'EUR',
      pages: { about: { de: '/ueber-uns' } },
      bricks: { blog: collection({ label: 'Blog', max: 50, order: 'manual', route: { de: '/blog/[slug]' }, fields: { title: f.text('Titel'), slug: f.slug('Adresse', { from: 'title' }) } }) },
    }))
    vi.stubGlobal('useConvexQuery', () => ({ data: ref([]), error: ref(undefined) }))
    const wrapper = mount(EntryEditor, {
      props: { site: { slug: 'restaurant', url: 'https://restaurant.test', previewOrigins: [], schemaRev: 1, contentRev: 1, name: 'Restaurant' }, schema: routed, brickKey: 'blog', brick: routed.bricks.blog!, canRemove: false },
      global: { stubs: { EntryFields: true, NuxtLink: true }, components: { PreviewPane } },
    })
    await wrapper.findAll('button').find((b) => b.text() === 'Vorschau')!.trigger('click')
    expect(wrapper.find('iframe').exists()).toBe(false)
    expect(wrapper.text()).toContain('Die Vorschau zeigt die Seite, sobald „Titel“ ausgefüllt ist.')

    wrapper.findComponent({ name: 'EntryFields' }).vm.$emit('update', 'title', { de: 'Neuer Beitrag' })
    await vi.advanceTimersByTimeAsync(300)
    const frame = wrapper.get('iframe').element
    expect(new URL(frame.getAttribute('src')!).searchParams.get('path')).toBe('/blog/neuer-beitrag')
    // The site gets the new entry at that address: it finds the post there.
    const source = new MessageChannel().port1
    const post = vi.spyOn(source, 'postMessage').mockImplementation(() => {})
    Object.defineProperty(frame, 'contentWindow', { value: source })
    const session = new URL(frame.getAttribute('src')!).searchParams.get('session')
    window.dispatchEvent(new MessageEvent('message', { source, origin: 'https://restaurant.test', data: { type: 'ginko:ready', session } }))
    await vi.advanceTimersByTimeAsync(300)
    const sent = post.mock.calls.at(-1)![0] as { bundle: { bricks: { blog: { items: { id: string; urls?: Record<string, string> }[] } } } }
    expect(sent.bundle.bricks.blog.items.find((item) => item.id === 'new')?.urls).toEqual({ de: '/blog/neuer-beitrag' })
  } finally {
    vi.useRealTimers()
    vi.stubGlobal('useConvexQuery', () => ({ data: ref(undefined), error: ref(undefined) }))
  }
})

// Wrong behaviour caught: removing a draft asked as if it "leaves the website", where it never was.
test.each([
  ['live' as const, '„Herbstfest“ geht von der Website. Du findest es 30 Tage lang im Papierkorb und kannst es dort wiederherstellen.'],
  ['draft' as const, '„Herbstfest“ kommt in den Papierkorb. Du kannst es 30 Tage lang wiederherstellen.'],
])('the remove question of a %s entry says where it goes', async (state, text) => {
  vi.stubGlobal('useConvexQuery', () => ({ data: ref([]), error: ref(undefined) }))
  try {
    const entry = { _id: 'e1', brick: 'blog', kind: 'item' as const, order: 1, data: { title: { de: 'Herbstfest' } }, rev: 1, fieldRevs: {}, lifeRev: 1, prints: {}, state }
    const pass = { template: '<div><slot /></div>' }
    const wrapper = mount(EntryEditor, {
      props: { site: { slug: 'restaurant', url: 'https://restaurant.test', previewOrigins: [], schemaRev: 1, contentRev: 1, name: 'Restaurant' }, schema, brickKey: 'blog', brick: schema.bricks.blog!, entry, canRemove: true },
      global: {
        stubs: {
          EntryFields: true, PreviewPane: true, NuxtLink: true,
          DropdownMenu: pass, DropdownMenuTrigger: pass, DropdownMenuContent: pass,
          Dialog: { props: ['open'], template: '<div v-if="open"><slot /></div>' }, DialogContent: pass, DialogTitle: pass, DialogDescription: pass,
          DropdownMenuItem: { emits: ['select'], template: '<button type="button" @click="$emit(\'select\')"><slot /></button>' },
        },
      },
    })
    await wrapper.findAll('button').find((b) => b.text() === 'Eintrag entfernen …')!.trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain(text)
  } finally {
    vi.stubGlobal('useConvexQuery', () => ({ data: ref(undefined), error: ref(undefined) }))
  }
})

// Wrong behaviour caught: the preview of an entry not translated into the language shown fell back to the site's first
// page (/en/about-us) without a word, so the person saw an unrelated page (romi-10, J7 in another language).
test.each([
  ['hidden', undefined, 'Noch nicht auf Englisch übersetzt. Bis dahin ist der Eintrag auf der Website in dieser Sprache nicht zu sehen.'],
  ['listed in the main language', 'fallback' as const, 'Noch nicht auf Englisch übersetzt. Bis dahin hat der Eintrag in dieser Sprache keine eigene Seite. Listen zeigen ihn auf Deutsch.'],
])('the English preview of an untranslated new entry says it is %s there, and shows its page once translated', async (_name, untranslated, text) => {
  vi.useFakeTimers()
  vi.stubGlobal('useRoute', () => ({ query: { lang: 'en' } }))
  try {
    const routed = serializeSchema(defineSite({
      site: 'restaurant', name: 'Restaurant', url: 'https://restaurant.test', timeZone: 'Europe/Vienna', locales: ['de', 'en'], currency: 'EUR',
      pages: { about: { de: '/ueber-uns', en: '/en/about-us' } },
      bricks: { blog: collection({ label: 'Blog', max: 50, order: 'manual', route: { de: '/blog/[slug]', en: '/en/blog/[slug]' }, ...(untranslated ? { untranslated } : {}), fields: { title: f.text('Titel'), slug: f.slug('Adresse', { from: 'title' }) } }) },
    }))
    vi.stubGlobal('useConvexQuery', () => ({ data: ref([]), error: ref(undefined) }))
    const wrapper = mount(EntryEditor, {
      props: { site: { slug: 'restaurant', url: 'https://restaurant.test', previewOrigins: [], schemaRev: 1, contentRev: 1, name: 'Restaurant' }, schema: routed, brickKey: 'blog', brick: routed.bricks.blog!, canRemove: false },
      global: { stubs: { EntryFields: true, NuxtLink: true }, components: { PreviewPane } },
    })
    wrapper.findComponent({ name: 'EntryFields' }).vm.$emit('update', 'title', { de: 'Neuer Beitrag' })
    await vi.advanceTimersByTimeAsync(300)
    await wrapper.findAll('button').find((b) => b.text() === 'Vorschau')!.trigger('click')
    expect(wrapper.find('iframe').exists()).toBe(false)
    expect(wrapper.text()).toContain(text)

    wrapper.findComponent({ name: 'EntryFields' }).vm.$emit('update', 'title', { de: 'Neuer Beitrag', en: 'New post' })
    await vi.advanceTimersByTimeAsync(300)
    expect(new URL(wrapper.get('iframe').attributes('src')!).searchParams.get('path')).toBe('/en/blog/new-post')
  } finally {
    vi.useRealTimers()
    vi.stubGlobal('useRoute', () => ({ query: {} }))
    vi.stubGlobal('useConvexQuery', () => ({ data: ref(undefined), error: ref(undefined) }))
  }
})

// Wrong behaviour caught: a slip in Markdown mode replaced a long text with one line, and the save bar said nothing
// until the site had lost two paragraphs and four photos; or a lost link to a price list was counted as a picture.
const PICTURES = ['k1', 'k2', 'k3'].map((id) => `![Bild]($file.${id})`).join('\n\n') + '\n\n[Preisliste]($file.k4)'
const long = (pictures: boolean, length: number) => { const start = pictures ? `${PICTURES}\n\n` : ''; return start + 'x'.repeat(length - start.length) }
test.each([
  { before: long(true, 2400), after: 'y'.repeat(80), hint: /„Geschichte“ ist viel kürzer als vorher: 80 statt 2\D?400 Zeichen\. 4 Dateien weniger\./ },
  { before: long(true, 2400), after: long(true, 1500), hint: undefined },
  { before: 'x'.repeat(200), after: 'y'.repeat(10), hint: undefined },
])('the save bar points out a text that lost most of its length ($before.length → $after.length characters)', async ({ before, after, hint }) => {
  vi.useFakeTimers()
  try {
    const entry = { _id: 'e1', brick: 'blog', kind: 'item', order: 0, data: { title: { de: 'Alt' }, story: { de: before } }, rev: 1, fieldRevs: {}, lifeRev: 1, prints: {}, state: 'live' } as const
    const wrapper = mount(EntryEditor, {
      props: { site: { slug: 'restaurant', url: 'https://restaurant.test', previewOrigins: [], schemaRev: 1, contentRev: 1, name: 'Restaurant' }, schema, brickKey: 'blog', brick: schema.bricks.blog!, entry, canRemove: false },
      global: { stubs: { EntryFields: true, PreviewPane: true, NuxtLink: true } },
    })
    wrapper.findComponent({ name: 'EntryFields' }).vm.$emit('update', 'story', { de: after })
    await vi.advanceTimersByTimeAsync(300)
    const bar = wrapper.get('.bar').text()
    // The thousands separator is the Studio language's own (a narrow space in de-AT).
    if (hint) expect(bar).toMatch(hint)
    else expect(bar).not.toContain('kürzer als vorher')
  } finally {
    vi.useRealTimers()
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

// Wrong behaviour caught: the field note of a cleared required text of an entry that is online in English said the website
// shows the German text, although the brick hides untranslated entries, so the entry vanishes from the English site.
// EntryEditor must hand the note the brick (hidesUntranslated) and the entry's main-language title.
test('Alles bearbeiten on the English tab says a cleared title takes the entry off the English site', async () => {
  vi.stubGlobal('useRoute', () => ({ query: { lang: 'en' } }))
  try {
    const routed = serializeSchema(defineSite({
      site: 'restaurant', name: 'Restaurant', url: 'https://restaurant.test', timeZone: 'Europe/Vienna', locales: ['de', 'en'], currency: 'EUR',
      pages: { home: { de: '/', en: '/en' } },
      bricks: { events: collection({ label: 'Events', max: 50, order: 'manual', route: { de: '/events/[slug]', en: '/en/events/[slug]' }, fields: { title: f.text('Titel'), slug: f.slug('Adresse', { from: 'title' }) } }) },
    }))
    const entry = { _id: 'e1', brick: 'events', kind: 'item', order: 0, data: { title: { de: 'Kürbisabend', en: 'Pumpkin night' } }, rev: 1, fieldRevs: {}, lifeRev: 1, prints: {}, state: 'live', translation: { en: { page: 'shown', blocking: [], missing: [], outdated: [] } } } as const
    // The fields: the note under the title, as GinkoField reads it from the translation view.
    const Fields = vue.defineComponent({
      emits: ['update'],
      setup: () => {
        const translation = inject(TRANSLATION)!
        return () => vue.h('p', { 'data-leaf': 'title' }, translation.missingNote!('title'))
      },
    })
    const wrapper = mount(EntryEditor, {
      props: { site: { slug: 'restaurant', url: 'https://restaurant.test', previewOrigins: [], schemaRev: 1, contentRev: 1, name: 'Restaurant' }, schema: routed, brickKey: 'events', brick: routed.bricks.events!, entry, canRemove: false },
      global: { stubs: { EntryFields: Fields, PreviewPane: true, NuxtLink: true } },
    })
    // The English title is cleared; the server's state for the stored entry now lists it as blocking.
    await wrapper.setProps({ entry: { ...entry, data: { title: { de: 'Kürbisabend' } }, translation: { en: { page: 'shown', blocking: ['title'], missing: ['title'], outdated: [] } } } })
    await flushPromises()
    expect(wrapper.get('[data-leaf="title"]').text()).toBe('Noch nicht übersetzt. Ohne diesen Text fehlt „Kürbisabend“ auf der Website auf Englisch.')
  } finally {
    vi.stubGlobal('useRoute', () => ({ query: {} }))
  }
})
