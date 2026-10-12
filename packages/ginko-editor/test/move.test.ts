// @vitest-environment happy-dom
// Moving blocks (Alt+Arrow) in the headless core.
import { markdownBlocks } from '@lupinum/ginko/internal'
import { components } from '@lupinum/ginko-components/registry'
import { TextSelection } from '@tiptap/pm/state'
import { describe, expect, test } from 'vitest'
import { createGinkoEditor } from '../src/core/index.ts'

const open = async (text: string, profile: 'basic' | 'page' = 'basic') => {
  const handle = await createGinkoEditor({ text, profile, components: profile === 'page' ? components : undefined, element: document.createElement('div') })
  if (handle.mode !== 'rich') throw new Error(`expected rich: ${handle.problems}`)
  return handle
}

describe('moving blocks', () => {
  const TEXT = 'Eins  \n\n* Zwei\n* zwei b\n\n__Drei__\n\nVier\n'
  const select = (handle: Awaited<ReturnType<typeof open>>, index: number) => {
    let pos = 0
    handle.editor.state.doc.forEach((node, offset, i) => { if (i === index) pos = offset })
    handle.editor.view.dispatch(handle.editor.state.tr.setSelection(TextSelection.near(handle.editor.state.doc.resolve(pos + 1))))
  }

  test('the 3rd block above the 1st: only the order changes, every block is byte for byte', async () => {
    const handle = await open(TEXT)
    select(handle, 2)
    expect(handle.editor.commands.moveBlockUp()).toBe(true)
    expect(handle.editor.commands.moveBlockUp()).toBe(true)
    expect(handle.editor.commands.moveBlockUp()).toBe(false)
    const out = await handle.markdown()
    const before = await markdownBlocks(TEXT, { profile: 'basic' })
    const after = await markdownBlocks(out, { profile: 'basic' })
    const sources = before.blocks.map((b) => b.source)
    expect(after.blocks.map((b) => b.source)).toEqual([sources[2], sources[0], sources[1], sources[3]])
    expect(handle.dirty).toBe(true)
    // The selection travelled with the block: Alt+Arrow down twice puts everything back.
    handle.editor.commands.moveBlockDown()
    handle.editor.commands.moveBlockDown()
    expect(await handle.markdown()).toBe(TEXT)
  })

  test('the last block does not move below the typing room, a box moves as a whole', async () => {
    const text = 'Davor\n\n::callout{type="info"}\nEins\n::\n'
    const handle = await open(text, 'page')
    select(handle, 1)
    expect(handle.editor.commands.moveBlockDown()).toBe(false)
    expect(handle.editor.commands.moveBlockUp()).toBe(true)
    expect(await handle.markdown()).toBe('::callout{type="info"}\nEins\n::\n\nDavor\n')
  })
})
