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
import { EDITOR_COMPONENTS } from '../app/components/editor/context.ts'
import MarkdownEditor from '../app/components/editor/MarkdownEditor.vue'

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

interface Options { text: string; profile?: string; max?: number; assets?: GinkoAssets; blockers?: Map<string, string> }
async function mounted({ text, profile = 'page', max, assets, blockers }: Options) {
  const provide: Record<symbol, unknown> = { [EDITOR_COMPONENTS as symbol]: () => components }
  if (assets) provide[GINKO_ASSETS as symbol] = assets
  if (blockers) provide[BLOCKERS as symbol] = blockers
  const field = { type: 'markdown', label: 'Text', profile, ...(max ? { max } : {}) } as never
  const wrapper = mount(MarkdownEditor, { props: { id: 't', field, modelValue: text, invalid: false }, attachTo: document.body, global: { provide } })
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
})

describe('Markdown source', () => {
  test('typing is kept across the switch there and back', async () => {
    const wrapper = await mounted({ text: 'Eins\n', profile: 'basic' })
    const editor = editorOf(wrapper)
    editor.commands.focus('end')
    editor.commands.insertContent(' rich')
    await wrapper.get('button[aria-label="Markdown"]').trigger('click')
    await until(() => wrapper.find('textarea').exists())
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
