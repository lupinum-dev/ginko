// @vitest-environment happy-dom
// The slash menu entries: which ones a profile offers, the filter, and that an inserted component survives the trip to Markdown.
import { components } from '@lupinum/ginko-components/registry'
import type { MarkdownProfile } from '@lupinum/ginko/internal'
import type { Editor } from '@tiptap/core'
import { describe, expect, test } from 'vitest'
import { createGinkoEditor, filterSlashItems, slashItems, toggleTaskList } from '../src/core/index.ts'

const TEXT = ['heading2', 'heading3', 'heading4', 'bulletList', 'orderedList', 'taskList', 'blockquote', 'horizontalRule']
const RICH = [...TEXT, 'table', 'codeBlock', 'image']

describe('slashItems', () => {
  test.each<[MarkdownProfile, boolean, (ids: string[]) => void]>([
    ['inline', true, (ids) => expect(ids).toEqual([])],
    ['basic', true, (ids) => expect(ids).toEqual(TEXT)],
    ['rich', true, (ids) => expect(ids).toEqual(RICH)],
    ['page', false, (ids) => expect(ids).toEqual(RICH)],
    ['page', true, (ids) => {
      expect(ids.slice(0, RICH.length)).toEqual(RICH)
      expect(ids).toContain('component:callout')
      expect(ids).toContain('component:tabs')
      expect(ids).not.toContain('component:tab') // only valid inside tabs
      expect(ids).not.toContain('component:badge') // inline
    }],
  ])('profile %s (registry: %s)', (profile, withRegistry, check) => {
    check(slashItems({ profile, components: withRegistry ? components : undefined }).map((i) => i.id))
  })

  test('a component is listed under its editor group, with label and description in the reader language', () => {
    const registry = { note: { kind: 'block', label: { de: 'Hinweis', en: 'Note' }, describe: { de: 'Ein Kasten', en: 'A box' }, props: {}, editor: { group: { de: 'Hinweise', en: 'Notes' }, example: '::note\nText\n::' } } } as const
    const item = (locale: string) => slashItems({ profile: 'page', components: registry, locale }).find((i) => i.id === 'component:note')!
    expect(item('en')).toMatchObject({ group: 'Notes', label: 'Note', describe: 'A box' })
    expect(item('de')).toMatchObject({ group: 'Hinweise', label: 'Hinweis', describe: 'Ein Kasten' })
  })

  test('running a component entry inserts the structure of the example without its sample text', async () => {
    const handle = await createGinkoEditor({ text: 'Davor\n', profile: 'page', components, element: document.createElement('div') })
    if (handle.mode !== 'rich') throw new Error('expected rich')
    handle.editor.commands.setTextSelection(handle.editor.state.doc.content.size)
    handle.editor.commands.insertContent({ type: 'paragraph' })
    await slashItems({ profile: 'page', components }).find((i) => i.id === 'component:callout')!.run(handle.editor)
    expect(handle.dirty).toBe(true)
    // Type information, no title, empty text with the example text as placeholder, the cursor in it.
    expect(await handle.markdown()).toBe('Davor\n\n::callout{type="info"}\n::\n')
    const json = handle.editor.getJSON().content!
    const callout = json.find((n) => n.type === 'component')!
    expect(callout.attrs!.props).toEqual({ type: 'info' })
    expect(callout.content).toEqual([{ type: 'paragraph', attrs: { props: {}, bare: true, placeholder: 'Hier steht der Hinweis.' } }])
    expect(handle.editor.state.selection.$from.parent.attrs.placeholder).toBe('Hier steht der Hinweis.')
    handle.destroy()
  })

  test('tabs keep two tabs with their names and empty texts', async () => {
    const handle = await createGinkoEditor({ text: '', profile: 'page', components, element: document.createElement('div') })
    if (handle.mode !== 'rich') throw new Error('expected rich')
    await slashItems({ profile: 'page', components }).find((i) => i.id === 'component:tabs')!.run(handle.editor)
    const tabs = handle.editor.getJSON().content!.find((n) => n.type === 'component')!
    expect((tabs.content as Array<{ attrs: { props: unknown } }>).map((t) => t.attrs.props)).toEqual([{ title: 'npm' }, { title: 'pnpm' }])
    handle.destroy()
  })
})

describe('slash menu words', () => {
  const items = slashItems({ profile: 'page', components })

  test('no description shows syntax', () => {
    expect(items.filter((i) => /::|[{}]/.test(i.describe)).map((i) => i.id)).toEqual([])
  })

  test('no id and no label twice in a group; short forms of callout are not offered', () => {
    const keys = items.flatMap((i) => [`id ${i.id}`, `label ${i.group} ${i.label}`])
    expect(keys.filter((k, n) => keys.indexOf(k) !== n)).toEqual([])
    expect(items.map((i) => i.id)).not.toContain('component:warning')
    expect(items.find((i) => i.id === 'component:callout')!.label).toBe('Callout box')
  })

  test.each([
    ['tabs', 'component:tabs'], ['link', 'component:read-more'], ['tipp', 'component:callout'], ['box', 'component:callout'], ['warnung', 'component:callout'],
  ])('query %j finds %s', (query, id) => {
    expect(filterSlashItems(items, query).map((i) => i.id)).toContain(id)
  })
})

describe('filterSlashItems', () => {
  const items = slashItems({ profile: 'rich' })
  test.each([
    ['', items.length],
    ['überschrift', 3],
    ['ueberschrift', 3],
    ['UBERSCHRIFT', 3],
    ['liste', 3], // by label and by keyword
    ['punkte', 1], // description
    ['gibtsnicht', 0],
  ])('query %j finds %i', (query, count) => {
    expect(filterSlashItems(items, query)).toHaveLength(count)
  })

  test('a label match comes before a match in the description', () => {
    expect(filterSlashItems(items, 'bild')[0]!.id).toBe('image')
  })
})

describe('checklist', () => {
  const key = (editor: Editor, name: string) => editor.view.someProp('handleKeyDown', (f) => f(editor.view, new KeyboardEvent('keydown', { key: name })))
  const type = (editor: Editor, text: string) => editor.commands.insertContent(text)

  test('the slash item, typing, Enter for the next box, Enter on an empty item ends the list, a click ticks a box', async () => {
    const handle = await createGinkoEditor({ text: 'Davor', profile: 'basic', element: document.createElement('div') })
    if (handle.mode !== 'rich') throw new Error('expected rich')
    const editor = handle.editor
    editor.commands.setTextSelection(editor.state.doc.content.size - 1)
    key(editor, 'Enter')
    await slashItems({ profile: 'basic' }).find((i) => i.id === 'taskList')!.run(editor)
    type(editor, 'Brot')
    key(editor, 'Enter')
    type(editor, 'Milch')
    key(editor, 'Enter')
    key(editor, 'Enter')
    type(editor, 'Danach')
    let box = -1
    editor.state.doc.descendants((n, pos) => { if (box < 0 && n.type.name === 'taskCheckbox') box = pos })
    editor.view.someProp('handleClickOn', (f) => f(editor.view, box, editor.state.doc.nodeAt(box)!, box, new MouseEvent('click'), true))
    expect(await handle.markdown()).toBe('Davor\n\n- [x] Brot\n- [ ] Milch\n\nDanach')
    handle.destroy()
  })

  test('a bulleted list becomes a checklist with a box per item, and back', async () => {
    const handle = await createGinkoEditor({ text: '- a\n- b', profile: 'basic', element: document.createElement('div') })
    if (handle.mode !== 'rich') throw new Error('expected rich')
    handle.editor.commands.setTextSelection(3)
    toggleTaskList(handle.editor)
    expect(await handle.markdown()).toBe('- [ ] a\n- [ ] b')
    toggleTaskList(handle.editor)
    expect(await handle.markdown()).toBe('- a\n- b')
    handle.destroy()
  })
})
