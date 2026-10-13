// @vitest-environment happy-dom
// The headless editor core. One table over a corpus (the cases of packages/ginko/test/core/markdown-serialize.test.ts,
// a few more shapes of the comark tree, and every `editor.example` of the real component registry). Per case:
// (a) the tree survives the trip tree -> ProseMirror -> tree (lost props, slots, mark order, bare paragraphs);
// (b) open + markdown() without an edit returns the text byte for byte (the renderer must not touch it);
// (c) one real edit changes only the block it is in.
import { components } from '@lupinum/ginko-components/registry'
import { markdownBlocks, parseMarkdown, type ComponentRegistry, type MarkdownProfile } from '@lupinum/ginko/internal'
import type { Editor } from '@tiptap/core'
import { describe, expect, test } from 'vitest'
import { createGinkoEditor, fromEditorDoc, toEditorDoc } from '../src/core/index.ts'

interface Case { name: string; profile: MarkdownProfile; text: string; registry?: ComponentRegistry; unstable?: boolean }

// Copy of the corpus of the core test (not exported there), plus shapes found while reading comark's trees.
const FEATURES: Case[] = [
  { name: 'bold', profile: 'inline', text: 'Das ist **fett** gesetzt' },
  { name: 'italic', profile: 'inline', text: 'Das ist *kursiv* gesetzt' },
  { name: 'strikethrough', profile: 'inline', text: 'Das ist ~~weg~~ gesetzt' },
  { name: 'inline code', profile: 'inline', text: 'Das ist `code` gesetzt' },
  { name: 'link', profile: 'inline', text: 'Siehe [Lupinum](https://lupinum.com) dort' },
  { name: 'link with title', profile: 'inline', text: 'Siehe [Lupinum](https://lupinum.com "Titel") dort' },
  { name: 'line break', profile: 'inline', text: 'Zeile eins\\\nZeile zwei' },
  { name: 'emoji', profile: 'inline', text: 'Super 🎉' },
  { name: 'nested marks keep their order', profile: 'inline', text: '***a*** und [**c**](/x) und `**d**`' },
  // comark renders strong > em as `***b***`, which parses back as em > strong: the editor opens it as source.
  { name: 'strong around em (renderer swaps the order)', profile: 'inline', text: '**_b_**', unstable: true },
  { name: 'paragraphs', profile: 'basic', text: 'Eins\n\nZwei' },
  { name: 'h2 h3 h4', profile: 'basic', text: '## Zwei\n\n### Drei\n\n#### Vier\n\nText' },
  { name: 'heading with explicit id', profile: 'basic', text: '## Titel {#eigene-id}\n\nText', unstable: true },
  { name: 'bullet list', profile: 'basic', text: '- a\n- b\n  - c' },
  { name: 'ordered list with start', profile: 'basic', text: '3. a\n4. b' },
  { name: 'loose list (blank lines inside one block)', profile: 'basic', text: '- a\n\n- b\n\n- c' },
  { name: 'blockquote', profile: 'basic', text: '> Zitat\n> zweite Zeile' },
  { name: 'blockquote with list and paragraphs', profile: 'basic', text: '> a\n>\n> b\n\n> - x' },
  { name: 'alert', profile: 'basic', text: '> [!NOTE]\n> Hinweis' },
  { name: 'alert with two paragraphs', profile: 'basic', text: '> [!WARNING]\n> a\n>\n> b' },
  { name: 'divider', profile: 'basic', text: 'Davor\n\n---\n\nDanach' },
  { name: 'more marker', profile: 'basic', text: 'Anriss\n\n<!-- more -->\n\nRest' },
  { name: 'footnote', profile: 'basic', text: 'Text[^1]\n\n[^1]: Fußnote', unstable: true },
  { name: 'table', profile: 'rich', text: '| a   | b   |\n| --- | --- |\n| 1   | 2   |' },
  { name: 'table with alignment and an empty cell', profile: 'rich', text: '| a   | b   |\n| :-- | --: |\n| 1   |     |' },
  { name: 'table with a header only', profile: 'rich', text: '| a   | b   |\n| --- | --- |' },
  { name: 'image', profile: 'rich', text: '![Alt](/bild.png)' },
  { name: 'code block with filename', profile: 'rich', text: '```ts [a.ts]\nconst a = 1\n\nconst b = 2\n```' },
  { name: 'task list', profile: 'basic', text: '- [x] fertig\n- [ ] offen' },
  { name: 'task list with marks', profile: 'basic', text: '- [x] **fett** und\n- [ ] a' },
  // comark's writer breaks a nested task list (`- [ ] - [x] b`) and wraps an ordered one in `{.contains-task-list}`; core fixes both.
  { name: 'nested task list', profile: 'basic', text: '- [ ] a\n  - [x] b' },
  { name: 'task list nested in a bullet list', profile: 'basic', text: '- a\n  - [ ] b\n  - [x] c\n- d' },
  { name: 'task list mixed with plain items', profile: 'basic', text: '- [x] fertig\n- einfach\n- [ ] offen' },
  { name: 'task list with a plain sub-list', profile: 'basic', text: '- [ ] a\n  - b\n  - c' },
  { name: 'task list with a link', profile: 'basic', text: '- [ ] Siehe [Lupinum](https://lupinum.com)\n- [x] `code` und *kursiv*' },
  { name: 'ordered task list', profile: 'basic', text: '1. [x] a\n2. [ ] b' },
  { name: 'task list between text', profile: 'basic', text: 'Davor\n\n- [ ] a\n- [x] b\n\nDanach' },
  { name: 'inline math', profile: 'rich', text: 'Formel $x^2$ im Text' },
  { name: 'block math', profile: 'rich', text: '$$\nE=mc^2\n$$' },
  { name: 'mermaid', profile: 'rich', text: '```mermaid\ngraph TD; A-->B\n```' },
  { name: 'h1 h5 h6', profile: 'page', text: '# Eins\n\n##### Fünf\n\n###### Sechs' },
  { name: 'component', profile: 'page', text: '::callout{type="warning"}\nHinweistext\n::', registry: components },
  { name: 'inline component', profile: 'page', text: 'Das ist :badge[neu]{color="success"} im Text', registry: components },
  { name: 'component with slot template', profile: 'page', text: '::callout\nHaupttext\n\n#footer\nFuß\n::', registry: { callout: { ...components.callout, slots: { footer: { label: 'Fuß' } } } } },
  { name: 'nested components', profile: 'page', text: ':::tabs\n::tab{title="a"}\nx\n::\n:::', registry: components },
  // Without a registry a component keeps the global attributes only (attributeProblem).
  { name: 'components without a registry', profile: 'page', text: '::foo{data-a="1"}\nText :bar[x]\n::' },
]

// The examples of the real registry, with the `page` profile and the registry.
const EXAMPLES: Case[] = Object.entries(components).map(([tag, def]) => ({
  name: `registry: ${tag}`,
  profile: 'page',
  text: def.editor!.example!,
  registry: components,
}))

const CASES = [...FEATURES, ...EXAMPLES]

const textblocks = (editor: Editor) => {
  const list: Array<{ end: number }> = []
  editor.state.doc.descendants((node, pos) => { if (node.isTextblock) list.push({ end: pos + node.nodeSize - 1 }) })
  return list
}
const appendX = (editor: Editor, which: number) => {
  const list = textblocks(editor)
  editor.commands.insertContentAt(list[which < 0 ? list.length + which : which]!.end, 'X')
}

describe('editor core corpus', () => {
  test.each(CASES)('$name', async ({ profile, text, registry, unstable }) => {
    const options = { profile, components: registry }
    const { value } = await parseMarkdown(text, options)

    // (a) tree -> ProseMirror -> tree, also after the JSON copy the editor makes
    expect(fromEditorDoc(toEditorDoc(value.nodes, { components: registry }))).toEqual(value.nodes)

    const handle = await createGinkoEditor({ text, ...options })
    if (unstable) {
      expect(handle.mode).toBe('source')
      expect(await handle.markdown()).toBe(text)
      return
    }
    expect(handle.problems).toEqual([])
    expect(handle.mode).toBe('rich')
    if (handle.mode !== 'rich') return
    // The editor keeps an empty paragraph below a last non-paragraph block; it is not part of the text.
    const shown = handle.editor.getJSON()
    const last = shown.content?.at(-1)
    const trailing = value.nodes.length > 0 && last?.type === 'paragraph' && !last.content?.length && (value.nodes.at(-1) as string[])[0] !== 'p'
    expect(fromEditorDoc(trailing ? { ...shown, content: shown.content!.slice(0, -1) } : shown)).toEqual(value.nodes)

    // (b) nothing edited: the exact text
    expect(await handle.markdown()).toBe(text)
    expect(handle.dirty).toBe(false)
    handle.destroy()

    // (c) one edit changes one block. `Vorher` and `Nachher` frame the case, so a block next to it is checked too.
    // The inline profile is one paragraph: no frame, the edit is in the paragraph itself.
    const inline = profile === 'inline'
    const framed = inline ? text : `Vorher\n\n${text}\n\nNachher\n`
    const before = await markdownBlocks(framed, options)
    const edits = inline ? [{ which: -1, label: 'the paragraph' }] : [{ which: 0, label: 'Vorher' }, { which: -1, label: 'Nachher' }, { which: -2, label: 'the case' }]
    for (const { which, label } of edits) {
      const editor = await createGinkoEditor({ text: framed, ...options })
      if (editor.mode !== 'rich') throw new Error('framed text did not open as a rich document')
      if (which === -2 && textblocks(editor.editor).length < 3) { editor.destroy(); continue } // e.g. `::figure` has no text of its own
      appendX(editor.editor, which)
      expect(editor.dirty, label).toBe(true)
      const out = await editor.markdown()
      editor.destroy()
      const after = await markdownBlocks(out, options)
      expect(after.blocks.length, label).toBe(before.blocks.length)
      const changed = after.blocks.map((b, i) => (b.source === before.blocks[i]!.source ? -1 : i)).filter((i) => i >= 0)
      expect(changed, `${label}: changed blocks`).toHaveLength(1)
      expect(after.blocks[changed[0]!]!.source, label).toContain('X')
      expect(after.blocks.map((b) => b.gap), `${label}: spacing`).toEqual(before.blocks.map((b) => b.gap))
      expect(after.tail).toBe(before.tail)
    }
  })
})

describe('createGinkoEditor', () => {
  test('a text that comark cannot render back (footnotes) opens as source, unchanged', async () => {
    const text = 'Text[^1]\n\n[^1]: Fußnote\n'
    const handle = await createGinkoEditor({ text, profile: 'basic' })
    expect(handle.mode).toBe('source')
    expect(handle.editor).toBeUndefined()
    if (handle.mode !== 'source') return
    expect(handle.dirty).toBe(false)
    expect(await handle.markdown()).toBe(text)
    handle.source = 'Neuer Text'
    expect(handle.dirty).toBe(true)
    expect(await handle.markdown()).toBe('Neuer Text')
  })

  test('a text the profile does not allow opens as source, not as a document that drops it', async () => {
    const handle = await createGinkoEditor({ text: '| a |\n| - |', profile: 'basic' })
    expect(handle.mode).toBe('source')
    expect(handle.problems.length).toBeGreaterThan(0)
  })

  test.each(['inline', 'basic', 'page'] as const)('an empty text opens as a document with one empty paragraph (%s), unchanged until typed in', async (profile) => {
    const handle = await createGinkoEditor({ text: '', profile, element: document.createElement('div') })
    if (handle.mode !== 'rich') throw new Error(`expected rich, got source: ${handle.problems}`)
    expect(handle.dirty).toBe(false)
    expect(await handle.markdown()).toBe('')
    appendX(handle.editor, -1)
    expect(await handle.markdown()).toBe('X')
    handle.destroy()
  })

  test('dirty means a real change: typing and undoing it is clean again', async () => {
    // Undo needs the mounted editor: without an element TipTap runs without plugins (no history).
    const handle = await createGinkoEditor({ text: 'Eins\n\nZwei\n', profile: 'basic', element: document.createElement('div') })
    if (handle.mode !== 'rich') throw new Error('expected rich')
    const seen: boolean[] = []
    handle.onChange(() => seen.push(handle.dirty))
    expect(handle.dirty).toBe(false)
    appendX(handle.editor, -1)
    expect(handle.dirty).toBe(true)
    expect(await handle.markdown()).toBe('Eins\n\nZweiX\n')
    handle.editor.commands.undo()
    expect(handle.dirty).toBe(false)
    expect(await handle.markdown()).toBe('Eins\n\nZwei\n')
    expect(seen).toEqual([true, false])
    handle.destroy()
  })
})

describe('leaving a text and a box', () => {
  const TEXT = 'Davor\n\n::callout{type="info"}\nEins\n::\n'
  const open = async (text: string) => {
    const handle = await createGinkoEditor({ text, profile: 'page', components, element: document.createElement('div') })
    if (handle.mode !== 'rich') throw new Error('expected rich')
    return handle
  }
  const key = (editor: Editor, name: string) => editor.view.someProp('handleKeyDown', (f) => f(editor.view, new KeyboardEvent('keydown', { key: name })))
  /** Puts the cursor at the end of the text of the first callout. */
  const endOfCallout = (editor: Editor) => {
    let end = 0
    editor.state.doc.descendants((n, pos) => { if (n.type.name === 'paragraph' && n.textContent === 'Eins') end = pos + 1 + n.content.size })
    editor.commands.setTextSelection(end)
  }

  test('a last component is followed by an empty paragraph that is not saved: untouched text stays byte for byte', async () => {
    const handle = await open(TEXT)
    expect(handle.editor.state.doc.lastChild!.type.name).toBe('paragraph')
    expect(handle.editor.state.doc.lastChild!.content.size).toBe(0)
    expect(handle.dirty).toBe(false)
    expect(await handle.markdown()).toBe(TEXT)
    appendX(handle.editor, 0)
    expect(await handle.markdown()).toBe(TEXT.replace('Davor', 'DavorX'))
    handle.destroy()
  })

  test('ArrowDown at the end of the content of a box moves the cursor to the paragraph after it', async () => {
    const handle = await open(TEXT)
    endOfCallout(handle.editor)
    expect(key(handle.editor, 'ArrowDown')).toBe(true)
    const { $from } = handle.editor.state.selection
    expect($from.parent.type.name).toBe('paragraph')
    expect($from.depth).toBe(1)
    expect(await handle.markdown()).toBe(TEXT)
    handle.destroy()
  })

  test('Enter in an empty last paragraph of a box leaves it and drops that paragraph', async () => {
    const handle = await open(TEXT)
    endOfCallout(handle.editor)
    handle.editor.commands.insertContent({ type: 'paragraph' })
    expect(handle.editor.state.selection.$from.depth).toBe(2)
    expect(key(handle.editor, 'Enter')).toBe(true)
    expect(handle.editor.state.selection.$from.depth).toBe(1)
    expect(await handle.markdown()).toBe(TEXT)
    handle.destroy()
  })

  test('typing with a component selected does not replace it', async () => {
    const handle = await open(TEXT)
    let pos = 0
    handle.editor.state.doc.descendants((n, p) => { if (n.type.name === 'component') pos = p })
    handle.editor.commands.setNodeSelection(pos)
    expect(key(handle.editor, 'x')).toBe(true)
    expect(handle.editor.view.someProp('handleTextInput', (f) => f(handle.editor.view, pos, pos + 1, 'x', () => handle.editor.state.tr))).toBe(true)
    expect(await handle.markdown()).toBe(TEXT)
    handle.destroy()
  })
})
