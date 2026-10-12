// Moves the top-level block at the cursor one place up or down (Alt+Arrow). The block node moves as it is, so its
// original Markdown travels with it and every other block stays byte for byte (see editor.ts).
import { Extension, type Editor } from '@tiptap/core'
import { NodeSelection, TextSelection, type EditorState, type Transaction } from '@tiptap/pm/state'

/** Returns false when there is nowhere to go (first or last block) or when the move would pass the empty typing room below the last block. */
function applyMove(state: EditorState, tr: Transaction, direction: 'up' | 'down', dispatch: boolean): boolean {
  const { doc, selection } = state
  if (state.schema.topNodeType.spec.content === 'paragraph') return false // the inline profile has one paragraph
  const index = selection.$from.index(0)
  const target = direction === 'up' ? index - 1 : index + 1
  if (target < 0 || target >= doc.childCount) return false
  // The empty paragraph below the last block is not text (editor.ts drops it on save): it stays last.
  const isRoom = (i: number) => i === doc.childCount - 1 && doc.child(i).type.name === 'paragraph' && doc.child(i).content.size === 0
  if (isRoom(index) || isRoom(target)) return false

  let start = 0
  for (let i = 0; i < Math.min(index, target); i++) start += doc.child(i).nodeSize
  const upper = doc.child(Math.min(index, target))
  const lower = doc.child(Math.max(index, target))
  const moving = doc.child(index)
  if (!dispatch) return true
  tr.replaceWith(start, start + upper.nodeSize + lower.nodeSize, direction === 'up' ? [moving, upper] : [lower, moving])
  // The selection travels with the block: same offset inside it.
  const oldStart = direction === 'up' ? start + upper.nodeSize : start
  const newStart = direction === 'up' ? start : start + lower.nodeSize
  const shift = newStart - oldStart
  tr.setSelection(selection instanceof NodeSelection
    ? NodeSelection.create(tr.doc, selection.from + shift)
    : TextSelection.create(tr.doc, selection.anchor + shift, selection.head + shift))
  tr.scrollIntoView()
  return true
}

export const moveBlock = (editor: Editor, direction: 'up' | 'down') => (direction === 'up' ? editor.commands.moveBlockUp() : editor.commands.moveBlockDown())

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    ginkoMove: { moveBlockUp: () => ReturnType; moveBlockDown: () => ReturnType }
  }
}

export const MoveExtension = Extension.create({
  name: 'ginkoMove',
  addCommands() {
    return {
      moveBlockUp: () => ({ state, tr, dispatch }) => applyMove(state, tr, 'up', !!dispatch),
      moveBlockDown: () => ({ state, tr, dispatch }) => applyMove(state, tr, 'down', !!dispatch),
    }
  },
  addKeyboardShortcuts() {
    return { 'Alt-ArrowUp': () => moveBlock(this.editor, 'up'), 'Alt-ArrowDown': () => moveBlock(this.editor, 'down') }
  },
})
