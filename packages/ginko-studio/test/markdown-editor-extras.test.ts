// @vitest-environment happy-dom
// The Markdown field beyond typing: pictures by paste, the source switch, problems at the block, the counter, the link card chip.
import { components } from '@lupinum/ginko-components/registry'
import { BLOCKERS, GINKO_ASSETS, type GinkoAssets, type UploadState } from '@lupinum/ginko-editor'
import { flushPromises, mount } from '@vue/test-utils'
import type { Editor } from '@tiptap/core'
import { Slice } from '@tiptap/pm/model'
import { NodeSelection, TextSelection } from '@tiptap/pm/state'
import { EditorContent } from '@tiptap/vue-3'
import { toast } from 'vue-sonner'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { computed, reactive } from 'vue'
import { EDITOR_COMPONENTS, EDITOR_LINK_TARGETS } from '../app/components/editor/context.ts'
import type { SlashState } from '../app/components/editor/extensions.ts'
import MarkdownEditor from '../app/components/editor/MarkdownEditor.vue'
import SlashMenu from '../app/components/editor/SlashMenu.vue'
import { REFS } from '../app/components/fields/refs.ts'

vi.mock('vue-sonner', () => ({ toast: { error: vi.fn(), success: vi.fn(), dismiss: vi.fn() } }))

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))
const until = async (check: () => boolean, ms = 3000) => {
  for (let i = 0; i < ms / 20 && !check(); i++) { await wait(20); await flushPromises() }
  expect(check()).toBe(true)
}

const mountedWrappers: Array<{ unmount(): void }> = []
afterEach(() => { mountedWrappers.splice(0).forEach((w) => w.unmount()); document.body.innerHTML = '' })
beforeEach(() => { vi.mocked(toast.error).mockClear() })

/** Controllable upload adapter: `upload` resolves with 'u1'; `states` is the server's view of it. */
function fakeAssets(upload?: GinkoAssets['upload']) {
  const states = reactive<Record<string, UploadState>>({})
  const sent: File[] = []
  const assets: GinkoAssets = {
    state: (id) => computed(() => (id.value ? states[id.value] : undefined)),
    details: (ids) => computed(() => Object.fromEntries(ids.value.map((id) => [id, states[id]?.status === 'ready' ? { url: `https://cdn.test/${id}.png`, name: 'a.png', size: 1, width: 1, height: 1 } : null]))),
    upload: upload ?? (async (_kind, file) => { sent.push(file); return 'u1' }),
  }
  return { assets, states, sent }
}

interface Options { text: string; profile?: string; max?: number; assets?: GinkoAssets; blockers?: Map<string, string>; contentLocale?: string; provide?: Record<symbol, unknown> }
async function mounted({ text, profile = 'page', max, assets, blockers, contentLocale, provide: extra }: Options) {
  const provide: Record<symbol, unknown> = { [EDITOR_COMPONENTS as symbol]: () => components, ...extra }
  if (assets) provide[GINKO_ASSETS as symbol] = assets
  if (blockers) provide[BLOCKERS as symbol] = blockers
  const field = { type: 'markdown', label: 'Text', profile, ...(max ? { max } : {}) } as never
  const wrapper = mount(MarkdownEditor, { props: { id: 't', field, modelValue: text, invalid: false, ...(contentLocale ? { contentLocale } : {}) }, attachTo: document.body, global: { provide } })
  mountedWrappers.push(wrapper)
  await until(() => wrapper.find('[role="textbox"], textarea').exists())
  return wrapper
}
const editorOf = (wrapper: Awaited<ReturnType<typeof mounted>>) => wrapper.findComponent(EditorContent).props('editor') as Editor

function pasteInto(editor: Editor, clipboard: { text?: string; files?: File[] }) {
  const { view } = editor
  const event = { clipboardData: { getData: (type: string) => (type === 'text/plain' ? clipboard.text ?? '' : ''), files: clipboard.files ?? [] } } as unknown as ClipboardEvent
  return Boolean(view.someProp('handlePaste', (f) => f(view, event, Slice.empty)))
}
const png = (size = 10) => { const file = new File(['x'], 'foto.png', { type: 'image/png' }); Object.defineProperty(file, 'size', { value: size }); return file }

describe('pictures by paste', () => {
  // Wrong behaviour caught: the text stores the file's storage address, which breaks when the file is replaced or swept.
  test('uploading place, then the image as a library reference (shown with its address), then the description is asked for; the save waits meanwhile', async () => {
    const { assets, states, sent } = fakeAssets()
    const blockers = new Map<string, string>()
    const wrapper = await mounted({ text: 'Eins\n', assets, blockers })
    const editor = editorOf(wrapper)
    editor.commands.focus('end')
    expect(pasteInto(editor, { files: [png()] })).toBe(true)
    await until(() => sent.length === 1)
    expect(editor.view.dom.textContent).toContain('wird hochgeladen')
    expect(blockers.get('t-images')).toBe('Ein Bild wird noch hochgeladen. Bitte kurz warten.')

    states.u1 = { status: 'ready' }
    await until(() => editor.view.dom.querySelector('img') !== null)
    expect(editor.view.dom.querySelector('img')!.getAttribute('src')).toBe('https://cdn.test/u1.png')
    expect(editor.view.dom.textContent).not.toContain('wird hochgeladen')
    await until(() => !blockers.has('t-images'))
    // The picture has no description yet: it asks for one and the save is blocked until it has one.
    await until(() => document.body.textContent!.includes('Bild beschreiben'))
    expect(blockers.get('t-alt')).toBe('Ein Bild im Text hat noch keine Beschreibung.')
    expect(document.activeElement?.id).toBeTruthy()

    const input = document.querySelector<HTMLInputElement>('input[aria-required="true"]')!
    input.value = 'Ein Foto vom Hof'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await flushPromises()
    document.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }))
    await until(() => !blockers.has('t-alt'))
    await wait(350)
    expect(wrapper.emitted('update:modelValue')!.at(-1)).toEqual(['Eins![Ein Foto vom Hof]($file.u1)\n'])
  })

  test('a failed upload removes the place and says why', async () => {
    const { assets } = fakeAssets(async () => { throw new Error('Der Speicher ist voll.') })
    const wrapper = await mounted({ text: 'Eins\n', assets })
    const editor = editorOf(wrapper)
    pasteInto(editor, { files: [png()] })
    await until(() => vi.mocked(toast.error).mock.calls.length === 1)
    expect(vi.mocked(toast.error).mock.calls[0]![0]).toBe('Der Speicher ist voll.')
    expect(editor.view.dom.textContent).not.toContain('wird hochgeladen')
    expect(editor.view.dom.querySelector('img')).toBeNull()
  })

  test('a file over the limit is refused before the upload, with the limit', async () => {
    const { assets, sent } = fakeAssets()
    const wrapper = await mounted({ text: 'Eins\n', assets })
    const editor = editorOf(wrapper)
    expect(pasteInto(editor, { files: [png(21 * 1024 * 1024)] })).toBe(true)
    await until(() => vi.mocked(toast.error).mock.calls.length === 1)
    expect(vi.mocked(toast.error).mock.calls[0]![0]).toBe('Die Datei ist zu groß (höchstens 20 MB).')
    expect(sent).toHaveLength(0)
    expect(editor.view.dom.textContent).not.toContain('wird hochgeladen')
  })

  // Wrong behaviour caught: "Bild ersetzen" with an upload removed the old picture before the upload ran, so a failed
  // upload left the text without any picture; a successful one must still take the old one's place, once.
  test.each([
    ['the server fails it', { status: 'failed', error: 'Das Bild ließ sich nicht verarbeiten.' } as UploadState, 'https://x.test/hof.png'],
    ['it is ready', { status: 'ready' } as UploadState, 'https://cdn.test/u1.png'],
  ])('a replacing upload keeps the old picture until it is ready, then takes its place (%s)', async (_name, state, shown) => {
    const { assets, states, sent } = fakeAssets()
    const wrapper = await mounted({ text: 'Eins ![Hof](https://x.test/hof.png) zwei\n', assets })
    const editor = editorOf(wrapper)
    let pos = -1
    editor.state.doc.descendants((node, at) => { if (node.type.name === 'image') pos = at })
    const upload = wrapper.findComponent({ name: 'ImageDialog' }).props('upload') as (file: File, replace?: number) => void
    upload(png(), pos)
    await until(() => sent.length === 1)
    expect(editor.view.dom.textContent).toContain('wird hochgeladen')
    expect([...editor.view.dom.querySelectorAll('img')].map((img) => img.getAttribute('src'))).toEqual(['https://x.test/hof.png'])
    states.u1 = state
    await until(() => !editor.view.dom.textContent!.includes('wird hochgeladen'))
    expect([...editor.view.dom.querySelectorAll('img')].map((img) => img.getAttribute('src'))).toEqual([shown])
  })

  // Wrong behaviour caught: a picture whose library file is described counts as undescribed in the editor, so a text the
  // server accepts (from the migration or an export: `![]($file.<id>)`) cannot be saved in the Studio.
  test('a picture without its own text but with a library description in the text\'s language does not block the save', async () => {
    const { assets } = fakeAssets()
    assets.details = (ids) => computed(() => Object.fromEntries(ids.value.map((id) => [id, { url: `https://cdn.test/${id}.png`, name: 'a.png', size: 1, width: 1, height: 1, alt: { de: 'Ein Foto vom Hof' } }])))
    const blockers = new Map<string, string>()
    const wrapper = await mounted({ text: '![]($file.u1)\n', assets, blockers, contentLocale: 'de' })
    await until(() => editorOf(wrapper).view.dom.querySelector('img') !== null)
    await until(() => !blockers.has('t-alt'))
    expect(document.querySelector('.ginko-problem-note')).toBeNull()
  })
})

describe('Markdown source', () => {
  test('typing is kept across the switch there and back', async () => {
    const wrapper = await mounted({ text: 'Eins\n', profile: 'basic' })
    const editor = editorOf(wrapper)
    editor.commands.focus('end')
    editor.commands.insertContent(' rich')
    await wrapper.get('button[aria-label="Markdown"]').trigger('click')
    await until(() => wrapper.find('textarea').exists())
    // Above the source the switch shows its word from the md viewport on only: on a phone it squeezed the note beside it.
    expect(wrapper.get('button[aria-label="Markdown"] span').classes()).toEqual(['hidden', 'md:inline'])
    const area = wrapper.get('textarea')
    expect((area.element as HTMLTextAreaElement).value).toBe('Eins rich\n')
    await area.setValue('Eins rich **source**\n')
    await wrapper.get('button[aria-label="Markdown"]').trigger('click')
    await until(() => wrapper.find('[role="textbox"]').exists())
    expect(wrapper.get('[role="textbox"]').text()).toBe('Eins rich source')
    await wait(350)
    expect(wrapper.emitted('update:modelValue')!.at(-1)).toEqual(['Eins rich **source**\n'])
  })

  test('a source that cannot be shown rich stays in source, with the reason', async () => {
    const wrapper = await mounted({ text: 'Eins\n', profile: 'basic' })
    await wrapper.get('button[aria-label="Markdown"]').trigger('click')
    await until(() => wrapper.find('textarea').exists())
    await wrapper.get('textarea').setValue('Text[^1]\n\n[^1]: Fußnote\n')
    await wrapper.get('button[aria-label="Markdown"]').trigger('click')
    await until(() => wrapper.text().includes('Dieser Text wird als Markdown bearbeitet.'))
    expect(wrapper.find('textarea').exists()).toBe(true)
    expect((wrapper.get('textarea').element as HTMLTextAreaElement).value).toBe('Text[^1]\n\n[^1]: Fußnote\n')
  })
})

describe('problems at the block', () => {
  test('a component without its address: red block, the note under it, "Beheben" selects it', async () => {
    const wrapper = await mounted({ text: 'Text\n\n::read-more{href="/x"}\nWeiter\n::\n' })
    const editor = editorOf(wrapper)
    expect(wrapper.find('.ginko-problem-note').exists()).toBe(false)
    editor.commands.command(({ tr }) => {
      tr.doc.descendants((node, pos) => { if (node.type.name === 'component') tr.setNodeMarkup(pos, undefined, { ...node.attrs, props: {} }) })
      return true
    })
    await until(() => wrapper.find('.ginko-problem-note').exists())
    expect(wrapper.find('.ginko-problem').exists()).toBe(true)
    expect(wrapper.get('.ginko-problem-note').text()).toContain('Link fehlt.')
    editor.commands.setTextSelection(1)
    await wrapper.get('.ginko-problem-note button').trigger('click')
    expect(editor.state.selection).toBeInstanceOf(NodeSelection)
    expect((editor.state.selection as NodeSelection).node.type.name).toBe('component')
  })

  test('a source with a problem lists it with its line and "Beheben" puts the cursor there', async () => {
    const wrapper = await mounted({ text: 'Gut.\n\n::script\nx\n::\n' })
    await until(() => wrapper.find('textarea').exists())
    await until(() => wrapper.find('ul[aria-label="Probleme im Text"]').exists())
    expect(wrapper.get('ul[aria-label="Probleme im Text"]').text()).toContain('Zeile 3: „script“ ist nicht erlaubt.')
    await wrapper.get('ul[aria-label="Probleme im Text"] button').trigger('click')
    const area = wrapper.get('textarea').element as HTMLTextAreaElement
    expect(area.value.slice(area.selectionStart, area.selectionEnd)).toBe('::script')
  })
})

describe('counter', () => {
  const countText = (w: Awaited<ReturnType<typeof mounted>>) => w.find('p[aria-live="polite"]')

  test('is hidden below 80% of the limit, shows from there, red at the limit, and over the limit it blocks the save', async () => {
    const blockers = new Map<string, string>()
    const wrapper = await mounted({ text: 'a'.repeat(30), profile: 'basic', max: 50, blockers })
    expect(countText(wrapper).exists()).toBe(false)
    const editor = editorOf(wrapper)
    editor.commands.focus('end')
    editor.commands.insertContent('b'.repeat(10))
    await wait(350)
    expect(countText(wrapper).text()).toBe('40 / 50 Zeichen')
    expect(countText(wrapper).classes()).not.toContain('text-destructive')
    editor.commands.insertContent('c'.repeat(10))
    await wait(350)
    expect(countText(wrapper).text()).toBe('50 / 50 Zeichen')
    expect(countText(wrapper).classes()).toContain('text-destructive')
    expect(blockers.has('t-max')).toBe(false)
    editor.commands.insertContent('d')
    await wait(350)
    expect(blockers.get('t-max')).toBe('Der Text ist zu lang (höchstens 50 Zeichen).')
    editor.commands.deleteRange({ from: editor.state.doc.content.size - 3, to: editor.state.doc.content.size - 1 })
    await wait(350)
    expect(blockers.has('t-max')).toBe(false)
  })
})

describe('a pasted address on an empty line', () => {
  test('offers a link card once; typing dismisses it; the card replaces the line', async () => {
    const wrapper = await mounted({ text: 'Eins\n' })
    const editor = editorOf(wrapper)
    editor.commands.insertContentAt(editor.state.doc.content.size, { type: 'paragraph' })
    editor.view.dispatch(editor.state.tr.setSelection(TextSelection.atEnd(editor.state.doc)))
    pasteInto(editor, { text: 'https://example.org/lesen' })
    await until(() => wrapper.text().includes('Als Weiterlesen-Link zeigen'))
    const chip = wrapper.findAll('button').find((b) => b.text().startsWith('Als Weiterlesen-Link'))!
    await chip.trigger('click')
    expect(wrapper.text()).not.toContain('Als Weiterlesen-Link zeigen')
    await wait(350)
    expect(wrapper.emitted('update:modelValue')!.at(-1)![0]).toContain('::read-more{href="https://example.org/lesen"}')

    pasteInto(editor, { text: 'https://example.org/zwei' })
    editor.commands.insertContent('x')
    await flushPromises()
    expect(wrapper.text()).not.toContain('Als Weiterlesen-Link zeigen')
  })
})

describe('a link to a page of the site', () => {
  // Wrong behaviour caught: the only way to link an own page was to copy its address from the website, which stored a
  // URL tied to one host (http://localhost:3000/…) and one language.
  test('typing a title lists the page; picking it stores the route link, which works on every host and in every language', async () => {
    const provide = {
      [EDITOR_LINK_TARGETS as symbol]: () => ({ pages: { home: { de: '/' }, kontakt: { de: '/kontakt' } }, routed: ['referenzen'] }),
      [REFS as symbol]: { options: (brick: () => string) => computed(() => (brick() === 'referenzen' ? [{ id: 'k57gs', title: 'Gesäuse Nationalpark' }] : [])), brickLabel: () => 'Referenzen' },
    }
    const wrapper = await mounted({ text: 'Mehr dazu\n', provide })
    const editor = editorOf(wrapper)
    editor.commands.setTextSelection({ from: 1, to: 10 })
    await wrapper.get('button[aria-label="Link"]').trigger('click')
    await until(() => !!document.querySelector('input[placeholder="Seite suchen oder https://…"]'))
    const input = document.querySelector<HTMLInputElement>('input[placeholder="Seite suchen oder https://…"]')!
    input.value = 'gesause'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await until(() => [...document.querySelectorAll('[role="option"]')].some((o) => o.textContent?.includes('Gesäuse Nationalpark')))
    const option = [...document.querySelectorAll<HTMLElement>('[role="option"]')].find((o) => o.textContent?.includes('Gesäuse Nationalpark'))!
    expect(option.textContent).toContain('Referenzen')
    option.click()
    await flushPromises()
    expect(editor.getAttributes('link').href).toBe('$referenzen.k57gs')
    await wait(350)
    expect(wrapper.emitted('update:modelValue')!.at(-1)).toEqual(['[Mehr dazu]($referenzen.k57gs)\n'])
  })
})

describe('the link field', () => {
  // Wrong behaviour caught: the page list took Home and End and cancelled them, so the caret did not move in a long address.
  test('Home and End move the caret in the typed address', async () => {
    const wrapper = await mounted({ text: 'Mehr dazu\n' })
    editorOf(wrapper).commands.setTextSelection({ from: 1, to: 10 })
    await wrapper.get('button[aria-label="Link"]').trigger('click')
    await until(() => !!document.querySelector('input[placeholder="Seite suchen oder https://…"]'))
    const input = document.querySelector<HTMLInputElement>('input[placeholder="Seite suchen oder https://…"]')!
    const press = (key: string) => { const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }); input.dispatchEvent(event); return event.defaultPrevented }
    expect([press('Home'), press('End')]).toEqual([false, false])
  })
})

describe('the toolbar', () => {
  // Wrong behaviour caught: a picture could only be added from the block type list labelled "Text" or the "/" menu, so
  // people found no way to add one.
  test('its "Bild einfügen" button opens the picture dialog', async () => {
    const { assets } = fakeAssets()
    const wrapper = await mounted({ text: 'Eins\n', assets })
    await wrapper.get('[role="toolbar"] button[aria-label="Bild einfügen"]').trigger('click')
    await until(() => document.querySelector('[role="dialog"]')?.textContent?.includes('Bild einfügen') === true)
  })

  // Wrong behaviour caught: on a phone or in a narrow column the row was wider than its frame, and Suchen and Markdown sat
  // behind an invisible sideways scroll.
  test('a narrow row keeps every tool reachable: what does not fit is under "Weitere Werkzeuge"', async () => {
    vi.stubGlobal('ResizeObserver', class {
      constructor(private report: (entries: { contentRect: { width: number } }[]) => void) {}
      observe() { this.report([{ contentRect: { width: 330 } }]) }
      unobserve() {}
      disconnect() {}
    })
    try {
      const { assets } = fakeAssets()
      const wrapper = await mounted({ text: 'Eins\n', assets })
      await flushPromises()
      const inRow = () => wrapper.findAll('[role="toolbar"] button').map((b) => b.attributes('aria-label'))
      expect(inRow()).toEqual(['Blocktyp', 'Fett', 'Kursiv', 'Link', 'Bild einfügen', 'Aufzählung', 'Nummerierte Liste', 'Weitere Werkzeuge'])
      await wrapper.get('button[aria-label="Weitere Werkzeuge"]').trigger('click')
      await until(() => document.querySelectorAll('[role="menu"] [role^="menuitem"]').length > 0)
      const items = [...document.querySelectorAll<HTMLElement>('[role="menu"] [role^="menuitem"]')]
      expect(items.map((i) => i.textContent?.trim())).toEqual(['Durchgestrichen', 'Code', 'Suchen', 'Markdown'])
      items.find((i) => i.textContent?.trim() === 'Suchen')!.click()
      await until(() => wrapper.find('[role="search"]').exists())
    } finally {
      vi.unstubAllGlobals()
    }
  })

  // Wrong behaviour caught: closing "Weitere Werkzeuge" without a choice (Escape) put the focus into the text, so a
  // keyboard user lost their place in the toolbar.
  test('"Weitere Werkzeuge" closed without a choice gives the focus back to its button; a chosen tool to the text', async () => {
    vi.stubGlobal('ResizeObserver', class {
      constructor(private report: (entries: { contentRect: { width: number } }[]) => void) {}
      observe() { this.report([{ contentRect: { width: 330 } }]) }
      unobserve() {}
      disconnect() {}
    })
    try {
      const wrapper = await mounted({ text: 'Eins\n', assets: fakeAssets().assets })
      await flushPromises()
      const more = wrapper.get('button[aria-label="Weitere Werkzeuge"]')
      const openMenu = async () => {
        await more.trigger('click')
        await until(() => document.querySelectorAll('[role="menu"] [role^="menuitem"]').length > 0)
      }
      await openMenu()
      document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
      await until(() => !document.querySelector('[role="menu"]'))
      await until(() => document.activeElement === more.element)
      await openMenu()
      ;[...document.querySelectorAll<HTMLElement>('[role="menu"] [role^="menuitem"]')].find((i) => i.textContent?.trim() === 'Durchgestrichen')!.click()
      await until(() => !document.querySelector('[role="menu"]'))
      await until(() => document.activeElement === editorOf(wrapper).view.dom)
    } finally {
      vi.unstubAllGlobals()
    }
  })
})

describe('block menu', () => {
  async function openMenu(wrapper: Awaited<ReturnType<typeof mounted>>) {
    // TipTap focuses the text a frame later; that focus would close the menu again.
    await until(() => document.activeElement === wrapper.get('[role="textbox"]').element)
    await wait(20)
    await wrapper.get('[role="toolbar"] button[aria-label="Blocktyp"]').trigger('click')
    await until(() => document.querySelector('input[aria-label="Suchen …"]') !== null)
    return document.querySelector<HTMLInputElement>('input[aria-label="Suchen …"]')!
  }
  const shown = () => [...document.querySelectorAll('[role="listbox"] [role="option"]')].map((o) => o.querySelector('span > span')!.textContent!.trim())
  const headings = () => [...document.querySelectorAll('[role="listbox"] [role="group"]')].map((g) => g.getAttribute('aria-label'))

  // Wrong behaviour caught: components (Spalten, Callout, ...) were only in the "/" menu, which people did not find; the
  // toolbar list had text styles only. Both lists now come from one source and must not drift apart.
  test('it offers what the "/" menu offers, plus "Text", grouped, with the search field focused', async () => {
    const wrapper = await mounted({ text: 'Eins\n' })
    const editor = editorOf(wrapper)
    editor.commands.focus('end')
    editor.commands.insertContent({ type: 'paragraph', content: [{ type: 'text', text: '/' }] })
    const { state } = wrapper.findComponent(SlashMenu).props() as { state: SlashState }
    await until(() => state.open && state.items.length > 0)
    const slash = state.items.map((i) => i.label)
    editor.commands.keyboardShortcut('Escape')
    const input = await openMenu(wrapper)
    expect(document.activeElement).toBe(input)
    expect(shown()).toEqual(['Text', ...slash])
    expect(shown()).toContain('Spalten')
    expect(headings()[0]).toBe('Text')
    expect(headings().length).toBeGreaterThan(1)
    // The current text style has the check mark.
    expect(document.querySelector('[role="option"][id] .sr-only')?.textContent?.trim()).toBe('(aktuell)')
  })

  test('typing "spal" and Enter inserts Spalten below the current text', async () => {
    const wrapper = await mounted({ text: 'Eins\n' })
    editorOf(wrapper).commands.focus('end')
    const input = await openMenu(wrapper)
    input.value = 'spal'
    input.dispatchEvent(new Event('input'))
    await flushPromises()
    expect(shown()[0]).toBe('Spalten')
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    await until(() => document.querySelector('[role="listbox"]') === null)
    await wait(350)
    const saved = String(wrapper.emitted('update:modelValue')!.at(-1)![0])
    expect(saved.startsWith('Eins\n\n::layout')).toBe(true)
  })

  test('arrow keys move the choice, Escape closes without a change', async () => {
    const wrapper = await mounted({ text: 'Eins\n' })
    editorOf(wrapper).commands.focus('end')
    const input = await openMenu(wrapper)
    const selected = () => document.querySelector('[role="option"][aria-selected="true"] span > span')!.textContent!.trim()
    expect(selected()).toBe('Text')
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))
    await flushPromises()
    expect(selected()).toBe('Überschrift')
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }))
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }))
    await flushPromises()
    expect(selected()).toBe(shown().at(-1))
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await until(() => document.querySelector('[role="listbox"]') === null)
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
  })

  // Wrong behaviour caught: a component or heading chosen in a table cell was written into the GFM row and broke the table.
  test('in a table cell only the picture is offered, in both menus', async () => {
    const wrapper = await mounted({ text: '| A | B |\n| - | - |\n|   | 2 |\n' })
    const editor = editorOf(wrapper)
    editor.chain().focus().setTextSelection(4).run()
    await openMenu(wrapper)
    expect(shown()).toEqual(['Bild'])
    expect(document.querySelector('[role="listbox"]')!.textContent).toContain('In einer Tabellenzelle steht nur Text und Bild.')
    document.querySelector<HTMLInputElement>('input[aria-label="Suchen …"]')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await until(() => document.querySelector('[role="listbox"]') === null)
    // The empty body cell: "/" there offers the same.
    let empty = 0
    editor.state.doc.descendants((node, pos) => { if (!empty && node.type.name === 'tableCell' && !node.textContent) empty = pos + 2; return !empty })
    editor.chain().focus().setTextSelection(empty).insertContent('/').run()
    const { state } = wrapper.findComponent(SlashMenu).props() as { state: SlashState }
    await until(() => state.open && state.items.length > 0)
    expect(state.items.map((i) => i.label)).toEqual(['Bild'])
  })
})
