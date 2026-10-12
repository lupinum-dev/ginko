// @vitest-environment happy-dom
// Find and replace in the headless core.
import { describe, expect, test } from 'vitest'
import { createGinkoEditor, searchInfo } from '../src/core/index.ts'

const open = async (text: string) => {
  const handle = await createGinkoEditor({ text, profile: 'basic', element: document.createElement('div') })
  if (handle.mode !== 'rich') throw new Error(`expected rich: ${handle.problems}`)
  return handle
}

describe('find and replace', () => {
  const TEXT = 'Apfel und apfel\n\n- **Apfel** pur\n- Birne\n\nAPFELMUS\n'

  test('finds case-insensitive by default, case-sensitive on request, counts across blocks', async () => {
    const { editor } = await open(TEXT)
    editor.commands.setSearch('apfel')
    expect(searchInfo(editor)).toEqual({ term: 'apfel', total: 4, current: 1 })
    editor.commands.setSearch('Apfel', { caseSensitive: true })
    expect(searchInfo(editor).total).toBe(2)
    editor.commands.setSearch('')
    expect(searchInfo(editor)).toEqual({ term: '', total: 0, current: 0 })
  })

  test('next and previous wrap around and select the match', async () => {
    const { editor } = await open(TEXT)
    editor.commands.setSearch('apfel')
    editor.commands.findPrev()
    expect(searchInfo(editor).current).toBe(4)
    editor.commands.findNext()
    expect(searchInfo(editor).current).toBe(1)
    const { from, to } = editor.state.selection
    expect(editor.state.doc.textBetween(from, to)).toBe('Apfel')
  })

  test('highlights matches with decorations', async () => {
    const handle = await open(TEXT)
    handle.editor.commands.setSearch('apfel')
    handle.editor.commands.findNext()
    const dom = handle.editor.view.dom
    expect(dom.querySelectorAll('.ginko-match')).toHaveLength(4)
    expect(dom.querySelectorAll('.ginko-match-current')).toHaveLength(1)
  })

  test('replaceAll changes only matching blocks, keeps marks, and is one undo step', async () => {
    const handle = await open(TEXT)
    handle.editor.commands.setSearch('apfel')
    handle.editor.commands.replaceAll('Kiwi')
    expect(await handle.markdown()).toBe('Kiwi und Kiwi\n\n- **Kiwi** pur\n- Birne\n\nKiwiMUS\n')
    expect(searchInfo(handle.editor).total).toBe(0)
    handle.editor.commands.undo()
    expect(await handle.markdown()).toBe(TEXT)
    expect(handle.dirty).toBe(false)
  })

  test('replaceCurrent replaces one match and moves on to the next', async () => {
    const handle = await open(TEXT)
    handle.editor.commands.setSearch('apfel')
    handle.editor.commands.replaceCurrent('Kiwi')
    expect(await handle.markdown()).toBe('Kiwi und apfel\n\n- **Apfel** pur\n- Birne\n\nAPFELMUS\n')
    expect(searchInfo(handle.editor)).toMatchObject({ total: 3, current: 1 })
  })

  test('a block without a match stays byte for byte', async () => {
    const text = 'Eins  \n\n*Zwei*\n\nDrei Treffer\n'
    const handle = await open(text)
    handle.editor.commands.setSearch('treffer')
    handle.editor.commands.replaceAll('Fund')
    expect(await handle.markdown()).toBe('Eins  \n\n*Zwei*\n\nDrei Fund\n')
  })
})
