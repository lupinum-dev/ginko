// @vitest-environment happy-dom
// What a paste or drop does beyond cleaning HTML: Markdown text, addresses, pictures; the upload place; problems at blocks.
import { components } from '@lupinum/ginko-components/registry'
import { coreMessage, type MarkdownProfile } from '@lupinum/ginko/internal'
import { Slice } from '@tiptap/pm/model'
import { TextSelection } from '@tiptap/pm/state'
import { describe, expect, test, vi } from 'vitest'
import {
  cancelUpload, createGinkoEditor, docProblems, figureTag, finishUpload, isUploading, linkCardTag, makeFigure, makeLinkCard, sourceProblems, startUpload,
  type GinkoEditorOptions, type GinkoRichEditor,
} from '../src/core/index.ts'

async function open(text: string, profile: MarkdownProfile = 'page', extra: Partial<GinkoEditorOptions> = {}) {
  const handle = await createGinkoEditor({ text, profile, components, element: document.createElement('div'), ...extra })
  if (handle.mode !== 'rich') throw new Error(`rich expected: ${handle.problems.join(' ')}`)
  return handle as GinkoRichEditor
}

/** Runs the editor's paste handler with a clipboard of the given texts and files. */
function paste(handle: GinkoRichEditor, clipboard: { text?: string; html?: string; files?: File[] }): boolean {
  const { view } = handle.editor
  const event = { clipboardData: { getData: (type: string) => (type === 'text/html' ? clipboard.html ?? '' : type === 'text/plain' ? clipboard.text ?? '' : ''), files: clipboard.files ?? [] } } as unknown as ClipboardEvent
  return Boolean(view.someProp('handlePaste', (f) => f(view, event, Slice.empty)))
}

const tick = () => new Promise((r) => setTimeout(r, 20))

describe('plain text that is Markdown', () => {
  test('is parsed: a heading and a list become nodes, not the characters', async () => {
    const handle = await open('', 'basic')
    expect(paste(handle, { text: '## Titel\n\n- eins\n- zwei' })).toBe(true)
    await tick()
    expect(await handle.markdown()).toBe('## Titel\n\n- eins\n- zwei')
  })

  test('a Markdown the profile does not allow stays text', async () => {
    const handle = await open('', 'inline')
    paste(handle, { text: '| a | b |\n| - | - |\n| 1 | 2 |' })
    await tick()
    expect(handle.editor.state.doc.textContent).toContain('| a | b |')
  })

  test('an ordinary sentence is left to the browser', async () => {
    const handle = await open('', 'basic')
    expect(paste(handle, { text: 'Ein ganz normaler Satz.' })).toBe(false)
  })
})

describe('a pasted address', () => {
  test('over selected text it makes that text a link and keeps the text', async () => {
    const handle = await open('Siehe unsere Karte\n', 'basic')
    handle.editor.view.dispatch(handle.editor.state.tr.setSelection(TextSelection.create(handle.editor.state.doc, 14, 19)))
    expect(paste(handle, { text: 'https://example.org/karte' })).toBe(true)
    expect(await handle.markdown()).toBe('Siehe unsere [Karte](https://example.org/karte)\n')
  })

  test('on an empty line it becomes a link and tells the UI where', async () => {
    const onUrlPasted = vi.fn()
    const handle = await open('Eins\n\nZwei\n', 'page', { onUrlPasted })
    // The caret in a new empty paragraph after "Eins".
    handle.editor.commands.insertContentAt(6, { type: 'paragraph' })
    handle.editor.commands.setTextSelection(7)
    paste(handle, { text: 'https://example.org/lesen' })
    expect(onUrlPasted).toHaveBeenCalledWith({ url: 'https://example.org/lesen', pos: 6 })
    expect(await handle.markdown()).toContain('<https://example.org/lesen>')
  })

  test('a link card replaces the paragraph with the component that has an href', async () => {
    const handle = await open('Eins\n', 'page')
    const tag = linkCardTag(components)
    expect(tag).toBe('read-more')
    handle.editor.commands.insertContentAt(handle.editor.state.doc.content.size, { type: 'paragraph', content: [{ type: 'text', text: 'https://example.org/x', marks: [{ type: 'link', attrs: { href: 'https://example.org/x' } }] }] })
    const pos = handle.editor.state.doc.content.size - handle.editor.state.doc.lastChild!.nodeSize
    expect(makeLinkCard(handle.editor, pos, 'https://example.org/x', tag!)).toBe(true)
    expect(await handle.markdown()).toContain('::read-more{href="https://example.org/x"}')
  })

  test('a registry without a component that takes just an address has no link card', () => {
    expect(linkCardTag(undefined)).toBeUndefined()
    expect(linkCardTag({ box: { kind: 'block', label: 'Box', describe: '', props: {} } } as never)).toBeUndefined()
  })
})

describe('a picture with a caption', () => {
  // Wrong behaviour caught: turning a picture into the figure block left an empty paragraph behind, lost the text around
  // a picture inside a line, or put the block somewhere else.
  test.each([
    ['alone in its paragraph', 'Eins\n\n![Hof](/hof.png)\n\nZwei\n', 'Eins\n\n::figure{src="/hof.png" alt="Hof"}\n::\n\nZwei\n'],
    ['at the start of a line', '![Hof](/hof.png) danach\n', '::figure{src="/hof.png" alt="Hof"}\n::\n\ndanach\n'],
    ['at the end of a line', 'davor ![Hof](/hof.png)\n', 'davor\n\n::figure{src="/hof.png" alt="Hof"}\n::\n'],
    ['inside a line', 'davor ![Hof](/hof.png) danach\n', 'davor\n\n::figure{src="/hof.png" alt="Hof"}\n::\n\ndanach\n'],
  ])('a picture %s becomes the figure block at its place', async (_name, text, markdown) => {
    const handle = await open(text, 'page')
    const tag = figureTag(components)
    expect(tag).toBe('figure')
    let pos = -1
    handle.editor.state.doc.descendants((node, at) => { if (node.type.name === 'image') pos = at })
    const at = makeFigure(handle.editor, pos, tag!, components, 'Hof')
    expect(handle.editor.state.doc.nodeAt(at!)?.attrs.tag).toBe('figure')
    expect(await handle.markdown()).toBe(markdown)
  })
})

describe('pictures', () => {
  const png = () => new File([new Uint8Array([1])], 'bild.png', { type: 'image/png' })

  test('a pasted picture goes to the UI, with the position of the caret', async () => {
    const onImageFiles = vi.fn(() => true)
    const handle = await open('Eins\n', 'rich', { onImageFiles })
    expect(paste(handle, { files: [png()] })).toBe(true)
    expect(onImageFiles).toHaveBeenCalledWith([expect.any(File)], handle.editor.state.selection.to)
  })

  test('text copied together with a picture (from Word) is text, not a picture', async () => {
    const onImageFiles = vi.fn(() => true)
    const handle = await open('Eins\n', 'rich', { onImageFiles })
    paste(handle, { files: [png()], text: 'Ein Absatz', html: '<p>Ein Absatz</p>' })
    expect(onImageFiles).not.toHaveBeenCalled()
  })

  test('a profile without pictures does not hand them over', async () => {
    const onImageFiles = vi.fn(() => true)
    const handle = await open('Eins\n', 'basic', { onImageFiles })
    expect(paste(handle, { files: [png()] })).toBe(false)
    expect(onImageFiles).not.toHaveBeenCalled()
  })

  test('the upload place follows the text, becomes the image, and is not in the saved text meanwhile', async () => {
    const handle = await open('Eins\n\nZwei\n', 'rich')
    const { editor } = handle
    expect(startUpload(editor, 'u1', 7)).toBe(true)
    expect(editor.view.dom.textContent).toContain('wird hochgeladen')
    expect(await handle.markdown()).toBe('Eins\n\nZwei\n')
    // Text before the place is typed: the place moves along.
    editor.commands.insertContentAt(1, 'XX')
    expect(finishUpload(editor, 'u1', { src: 'https://cdn.example.org/a.png', alt: '' })).toBe(9)
    expect(isUploading(editor, 'u1')).toBe(false)
    expect(await handle.markdown()).toBe('XXEins\n\n![](https://cdn.example.org/a.png)Zwei\n')
  })

  test('the placeholder shows the text the caller passes', async () => {
    const handle = await open('Eins\n', 'rich')
    startUpload(handle.editor, 'u1', 2, 'uploading …')
    expect(handle.editor.view.dom.textContent).toContain('uploading …')
  })

  test('a failed upload leaves no trace', async () => {
    const handle = await open('Eins\n', 'rich')
    startUpload(handle.editor, 'u1', 2)
    cancelUpload(handle.editor, 'u1')
    expect(handle.editor.view.dom.textContent).not.toContain('wird hochgeladen')
    expect(finishUpload(handle.editor, 'u1', { src: 'https://x.test/a.png', alt: 'a' })).toBeUndefined()
    expect(handle.dirty).toBe(false)
  })
})

describe('problems at the block', () => {
  test('a text in source: each message belongs to the block it is in, with its line', async () => {
    const text = 'Gut.\n\n::script\nx\n::\n\nAuch gut.\n\n::read-more{href="javascript:alert(1)"}\nx\n::\n'
    const problems = await sourceProblems(text, { profile: 'page', components })
    expect(problems.map((p) => [p.index, p.line, p.message])).toEqual([
      [1, 3, '„script“ ist nicht erlaubt.'],
      [3, 9, 'Link ist nicht erlaubt (nur http, https, mailto, tel oder /pfad).'],
    ])
  })

  test('a text without problems has none', async () => {
    expect(await sourceProblems('Alles gut.\n', { profile: 'basic' })).toEqual([])
  })

  test('the open document: a component without its required address, keyed by the top-level block; a picture without description', async () => {
    const handle = await open('Text\n\n::read-more{href="/x"}\nWeiter\n::\n\n![Foto](https://example.org/a.png)\n', 'page')
    expect(docProblems(handle.editor.state.doc, components)).toEqual([])
    handle.editor.commands.command(({ tr }) => {
      tr.doc.descendants((node, pos) => { if (node.type.name === 'component') tr.setNodeMarkup(pos, undefined, { ...node.attrs, props: {} }); if (node.type.name === 'image') tr.setNodeMarkup(pos, undefined, { ...node.attrs, alt: '' }) })
      return true
    })
    const found = docProblems(handle.editor.state.doc, components)
    expect(found.map((p) => [p.index, p.kind, p.message])).toEqual([
      [1, 'component', 'Link fehlt.'],
      [2, 'image', 'Dem Bild fehlt die Beschreibung.'],
    ])
    // The same problems carry a catalog key, so the Studio can say them in its language.
    expect(found.map((p) => [p.key, p.params, coreMessage('en', p.key, p.params)])).toEqual([
      ['editor.prop.missing', { label: 'Link' }, 'Link is missing.'],
      ['editor.problem.imageNoDescription', undefined, 'The image has no description.'],
    ])
  })

  test('a tag the registry does not have: key and params, English from the catalog', async () => {
    const handle = await open('::read-more{href="/x"}\nWeiter\n::\n', 'page')
    handle.editor.commands.command(({ tr }) => { tr.doc.descendants((node, pos) => { if (node.type.name === 'component') tr.setNodeMarkup(pos, undefined, { ...node.attrs, tag: 'nope' }) }); return true })
    const [problem] = docProblems(handle.editor.state.doc, components)
    expect([problem!.message, problem!.key, problem!.params]).toEqual(['„nope“ gibt es hier nicht.', 'editor.component.unknown', { tag: 'nope' }])
    expect(coreMessage('en', problem!.key, problem!.params)).toBe('“nope” does not exist here.')
  })

  test('the reasons for source mode carry a key too', async () => {
    const handle = await createGinkoEditor({ text: '::script\nx\n::\n', profile: 'page', components })
    expect(handle.problemMessages.map((p) => p.message)).toEqual(handle.problems)
    expect(handle.problemMessages[0]!.key).toBe('markdown.tagBlocked')
  })
})
