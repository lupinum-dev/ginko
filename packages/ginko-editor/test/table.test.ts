// @vitest-environment happy-dom
// The table commands: what each one does to the saved Markdown, and that none of them leaves a table GFM cannot hold.
import type { Editor } from '@tiptap/core'
import { describe, expect, test } from 'vitest'
import { canRunTable, createGinkoEditor, runTable, setColumnAlign, tableAt, type TableCommand } from '../src/core/index.ts'

async function open(text: string) {
  const handle = await createGinkoEditor({ text, profile: 'rich', element: document.createElement('div') })
  if (handle.mode !== 'rich') throw new Error('expected rich')
  return handle
}

/** Puts the cursor at the end of the text in cell (`row`, `column`); row 0 is the header. */
function cell(editor: Editor, row: number, column: number) {
  let target: number | undefined
  let r = -1
  editor.state.doc.descendants((node, pos) => {
    if (target !== undefined) return false
    if (node.type.name === 'tableRow') {
      r++
      if (r !== row) return false
      let c = 0
      node.forEach((child, offset) => {
        if (c++ === column) target = pos + 1 + offset + child.nodeSize - 2 // inside its paragraph, after the text
      })
      return false
    }
    return true
  })
  editor.commands.setTextSelection(target!)
}

const GRID = '| A | B | C |\n| - | - | - |\n| 1 | 2 | 3 |\n| 4 | 5 | 6 |\n| 7 | 8 | 9 |\n'

describe('table commands', () => {
  // The walkthrough of the task: build a table, add a column in the middle, move a row, delete a column, all without the
  // Markdown view. Wrong behaviour caught: any command writing cells out of place, or a table that is no clean GFM.
  test('a table built with the commands saves as a clean GFM table', async () => {
    const handle = await open('Davor\n')
    const { editor } = handle
    editor.commands.setTextSelection(editor.state.doc.content.size - 1)
    editor.chain().insertContent({ type: 'paragraph' }).insertTable({ rows: 4, cols: 3, withHeaderRow: true }).run()
    const labels = [['Name', 'Dauer', 'Preis'], ['Erste', '60', '90'], ['Zweite', '90', '120'], ['Dritte', '30', '50']]
    labels.forEach((row, r) => row.forEach((text, c) => { cell(editor, r, c); editor.commands.insertContent(text) }))
    cell(editor, 1, 0)
    expect(runTable(editor, 'addColumnAfter')).toBe(true)
    cell(editor, 0, 1)
    editor.commands.insertContent('Ort')
    cell(editor, 3, 0)
    expect(runTable(editor, 'moveRowUp')).toBe(true)
    cell(editor, 0, 2)
    expect(runTable(editor, 'deleteColumn')).toBe(true)
    expect(await handle.markdown()).toBe([
      'Davor', '',
      '| Name   | Ort | Preis |',
      '| ------ | --- | ----- |',
      '| Erste  |     | 90    |',
      '| Dritte |     | 50    |',
      '| Zweite |     | 120   |',
      '',
    ].join('\n'))
    handle.destroy()
  })

  test.each<[string, TableCommand, [number, number], string]>([
    ['row below', 'addRowAfter', [1, 0], '| A   | B   | C   |\n| --- | --- | --- |\n| 1   | 2   | 3   |\n|     |     |     |\n| 4   | 5   | 6   |\n| 7   | 8   | 9   |\n'],
    ['row above', 'addRowBefore', [2, 0], '| A   | B   | C   |\n| --- | --- | --- |\n| 1   | 2   | 3   |\n|     |     |     |\n| 4   | 5   | 6   |\n| 7   | 8   | 9   |\n'],
    ['column left', 'addColumnBefore', [1, 0], '|     | A   | B   | C   |\n| --- | --- | --- | --- |\n|     | 1   | 2   | 3   |\n|     | 4   | 5   | 6   |\n|     | 7   | 8   | 9   |\n'],
    ['move row down', 'moveRowDown', [1, 0], '| A   | B   | C   |\n| --- | --- | --- |\n| 4   | 5   | 6   |\n| 1   | 2   | 3   |\n| 7   | 8   | 9   |\n'],
    ['move column right', 'moveColumnRight', [0, 0], '| B   | A   | C   |\n| --- | --- | --- |\n| 2   | 1   | 3   |\n| 5   | 4   | 6   |\n| 8   | 7   | 9   |\n'],
    ['move column left', 'moveColumnLeft', [2, 2], '| A   | C   | B   |\n| --- | --- | --- |\n| 1   | 3   | 2   |\n| 4   | 6   | 5   |\n| 7   | 9   | 8   |\n'],
    ['delete row', 'deleteRow', [2, 1], '| A   | B   | C   |\n| --- | --- | --- |\n| 1   | 2   | 3   |\n| 7   | 8   | 9   |\n'],
    ['delete table', 'deleteTable', [1, 1], '\n'],
  ])('%s', async (_name, command, [row, column], expected) => {
    const handle = await open(GRID)
    cell(handle.editor, row, column)
    expect(runTable(handle.editor, command)).toBe(true)
    expect(await handle.markdown()).toBe(expected)
    handle.destroy()
  })

  // Wrong behaviour caught: GFM has exactly one header row on top. A row above it, a moved or deleted header row, gave
  // a table whose save invented a "Column 1" header or mixed header cells into the body.
  test('commands that would break the header row or the last column are refused', async () => {
    const handle = await open('Davor\n\n| A |\n| - |\n| 1 |\n| 2 |\n')
    const { editor } = handle
    const allowed = () => (['addRowBefore', 'moveRowUp', 'moveRowDown', 'deleteRow', 'deleteColumn', 'moveColumnLeft', 'moveColumnRight', 'addRowAfter'] as const).filter((c) => canRunTable(editor.state, c))
    cell(editor, 0, 0)
    expect(allowed()).toEqual(['addRowAfter'])
    cell(editor, 1, 0)
    expect(allowed()).toEqual(['addRowBefore', 'moveRowDown', 'deleteRow', 'addRowAfter'])
    cell(editor, 2, 0)
    expect(allowed()).toEqual(['addRowBefore', 'moveRowUp', 'deleteRow', 'addRowAfter'])
    const before = await handle.markdown()
    cell(editor, 0, 0)
    expect(runTable(editor, 'deleteRow')).toBe(false)
    expect(await handle.markdown()).toBe(before)
    editor.commands.setTextSelection(1)
    expect(tableAt(editor.state)).toBeUndefined()
    handle.destroy()
  })

  test('a column alignment writes the delimiter row, and the default goes back to ---', async () => {
    const handle = await open('| A | B |\n| :-: | - |\n| 1 | 2 |\n')
    const { editor } = handle
    cell(editor, 1, 1)
    expect(tableAt(editor.state)?.align).toBeUndefined()
    setColumnAlign(editor, 'right')
    expect(tableAt(editor.state)?.align).toBe('right')
    cell(editor, 0, 0)
    expect(tableAt(editor.state)?.align).toBe('center')
    setColumnAlign(editor, undefined)
    expect(await handle.markdown()).toBe('| A   | B   |\n| --- | --: |\n| 1   | 2   |\n')
    // The editor shows it as the site does.
    expect((editor.view.dom.querySelector('td:last-child') as HTMLElement).style.textAlign).toBe('right')
    handle.destroy()
  })

  // Wrong behaviour caught: a new row's cells have no alignment of their own, so the editor showed them left-aligned and
  // the column menu said "Links", while the saved column stayed centred. A GFM column has one alignment: its header's.
  test('a new row shows and reports the alignment of its column', async () => {
    const handle = await open('| A | B |\n| :-: | - |\n| 1 | 2 |\n')
    const { editor } = handle
    cell(editor, 1, 0)
    runTable(editor, 'addRowAfter')
    cell(editor, 2, 0)
    expect(tableAt(editor.state)).toMatchObject({ row: 2, column: 0, align: 'center' })
    const shown = [...editor.view.dom.querySelectorAll('tr')].map((tr) => (tr.firstElementChild as HTMLElement).style.textAlign)
    expect(shown).toEqual(['center', 'center', 'center'])
    expect(await handle.markdown()).toBe('| A   | B   |\n| :-: | --- |\n| 1   | 2   |\n|     |     |\n')
    handle.destroy()
  })

  test('Tab goes to the next cell, Shift+Tab back, Tab in the last cell adds a row', async () => {
    const handle = await open('| A | B |\n| - | - |\n| 1 | 2 |\n')
    const { editor } = handle
    const press = (key: string, shiftKey = false) => editor.view.dom.dispatchEvent(new KeyboardEvent('keydown', { key, shiftKey, bubbles: true, cancelable: true }))
    cell(editor, 1, 0)
    press('Tab')
    expect(tableAt(editor.state)).toMatchObject({ row: 1, column: 1 })
    press('Tab', true)
    expect(tableAt(editor.state)).toMatchObject({ row: 1, column: 0 })
    cell(editor, 1, 1)
    press('Tab')
    expect(tableAt(editor.state)).toMatchObject({ row: 2, column: 0, rows: 3 })
    handle.destroy()
  })

  // Wrong behaviour caught: Enter in a cell made a second paragraph (Shift+Enter a line break), and the save wrote both
  // lines into the row as one, "1   x". A GFM cell holds one line.
  test('Enter and Shift+Enter in a cell keep the cell one line', async () => {
    const handle = await open('| A | B |\n| - | - |\n| 1 | 2 |\n')
    const { editor } = handle
    cell(editor, 1, 0)
    for (const shiftKey of [false, true]) editor.view.dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', shiftKey, bubbles: true, cancelable: true }))
    editor.commands.insertContent('x')
    expect(await handle.markdown()).toBe('| A   | B   |\n| --- | --- |\n| 1x  | 2   |\n')
    handle.destroy()
  })
})
