// Row and column commands for the table at the cursor, limited to what a GFM table can hold: exactly one header row
// on top, at least one column, one alignment per column. The Studio draws them as the table bar.
import { Extension, type Editor } from '@tiptap/core'
import type { Node as PmNode } from '@tiptap/pm/model'
import { Plugin, PluginKey, type EditorState } from '@tiptap/pm/state'
import { moveTableColumn, moveTableRow, selectedRect, TableMap, type TableRect } from '@tiptap/pm/tables'
import { Decoration, DecorationSet } from '@tiptap/pm/view'

export type ColumnAlign = 'left' | 'center' | 'right'

export interface TableAt {
  /** Row of the cursor; 0 is the header row. */
  row: number
  column: number
  rows: number
  columns: number
  /** Alignment of the cursor's column, undefined for the default. */
  align: ColumnAlign | undefined
}

/** The selected cell's rectangle, or undefined outside a table (prosemirror-tables throws there). */
function rectOf(state: EditorState): TableRect | undefined {
  for (let d = state.selection.$from.depth; d > 0; d--) {
    if (state.selection.$from.node(d).type.spec.tableRole === 'table') return selectedRect(state)
  }
  return undefined
}

// Markdown keeps a column's alignment as `text-align` in the cells' style (`:-:` becomes `text-align:center`).
const ALIGN = /(?:^|;)\s*text-align\s*:\s*(left|center|right)\s*(?:;|$)/

export function alignOf(props: unknown): ColumnAlign | undefined {
  const style = (props as { style?: unknown } | null)?.style
  return typeof style === 'string' ? (ALIGN.exec(style)?.[1] as ColumnAlign | undefined) : undefined
}

/** A column's alignment is its header cell's: GFM keeps one per column, and a new row's cells have none of their own. */
const alignAt = (table: PmNode, map: TableMap, column: number) => alignOf(table.nodeAt(map.map[column]!)?.attrs.props)

/** Whether the cursor is in a table cell (a header cell too). */
export function inTableCell(state: EditorState): boolean {
  const { $from } = state.selection
  for (let d = $from.depth; d > 0; d--) {
    const role = $from.node(d).type.spec.tableRole
    if (role === 'cell' || role === 'header_cell') return true
  }
  return false
}

/** Where the cursor is in its table, or undefined outside one. */
export function tableAt(state: EditorState): TableAt | undefined {
  const rect = rectOf(state)
  if (!rect) return undefined
  return { row: rect.top, column: rect.left, rows: rect.map.height, columns: rect.map.width, align: alignAt(rect.table, rect.map, rect.left) }
}

function alignDecorations(doc: PmNode): DecorationSet {
  const shown: Decoration[] = []
  doc.descendants((node, pos) => {
    if (node.type.spec.tableRole !== 'table') return !node.isTextblock
    const map = TableMap.get(node)
    for (let column = 0; column < map.width; column++) {
      const align = alignAt(node, map, column)
      if (!align) continue
      for (const offset of new Set(map.map.filter((_, i) => i % map.width === column))) {
        const from = pos + 1 + offset
        shown.push(Decoration.node(from, from + node.nodeAt(offset)!.nodeSize, { style: `text-align:${align}` }))
      }
    }
    return false
  })
  return DecorationSet.create(doc, shown)
}

/**
 * A GFM cell holds one line. Enter and Shift+Enter in a cell do nothing: a second paragraph or a line break saved as
 * spaces, so the cell's two lines became one. Tab goes on to the next cell.
 */
export const TableKeys = Extension.create({
  name: 'ginkoTableKeys',
  priority: 1000,
  addKeyboardShortcuts() {
    const stay = () => inTableCell(this.editor.state)
    return { 'Enter': stay, 'Shift-Enter': stay, 'Mod-Enter': stay }
  },
})

const alignKey = new PluginKey<DecorationSet>('ginkoTableAlign')

/** Shows every column's alignment on all its cells, so the editor aligns as the site does. Display only; not saved. */
export const TableAlign = Extension.create({
  name: 'ginkoTableAlign',
  addProseMirrorPlugins() {
    return [new Plugin({
      key: alignKey,
      state: { init: (_, state) => alignDecorations(state.doc), apply: (tr, old) => (tr.docChanged ? alignDecorations(tr.doc) : old) },
      props: { decorations: (state) => alignKey.getState(state) },
    })]
  },
})

export type TableCommand =
  | 'addRowBefore' | 'addRowAfter' | 'addColumnBefore' | 'addColumnAfter'
  | 'moveRowUp' | 'moveRowDown' | 'moveColumnLeft' | 'moveColumnRight'
  | 'deleteRow' | 'deleteColumn' | 'deleteTable'

/**
 * Whether `command` keeps a valid GFM table at the cursor. The header row stays the first row and stays one: nothing
 * goes above it, it does not move, and it is not deleted (a table without one gets an invented "Column 1" on save).
 */
export function canRunTable(state: EditorState, command: TableCommand): boolean {
  const at = tableAt(state)
  if (!at) return false
  switch (command) {
    case 'addRowBefore': return at.row > 0
    case 'moveRowUp': return at.row > 1
    case 'moveRowDown': return at.row > 0 && at.row < at.rows - 1
    case 'moveColumnLeft': return at.column > 0
    case 'moveColumnRight': return at.column < at.columns - 1
    case 'deleteRow': return at.row > 0
    case 'deleteColumn': return at.columns > 1
    default: return true
  }
}

/** Runs `command` on the table at the cursor; false when `canRunTable` says no. */
export function runTable(editor: Editor, command: TableCommand): boolean {
  const at = tableAt(editor.state)
  if (!at || !canRunTable(editor.state, command)) return false
  const chain = editor.chain().focus()
  const move = (kind: 'row' | 'column', by: -1 | 1) => chain.command(({ state, dispatch }) => {
    const from = kind === 'row' ? at.row : at.column
    // The cursor goes with the row or column; prosemirror-tables would select all of it.
    return (kind === 'row' ? moveTableRow : moveTableColumn)({ from, to: from + by, select: false })(state, dispatch)
  })
  switch (command) {
    case 'addRowBefore': return chain.addRowBefore().run()
    case 'addRowAfter': return chain.addRowAfter().run()
    case 'addColumnBefore': return chain.addColumnBefore().run()
    case 'addColumnAfter': return chain.addColumnAfter().run()
    case 'moveRowUp': return move('row', -1).run()
    case 'moveRowDown': return move('row', 1).run()
    case 'moveColumnLeft': return move('column', -1).run()
    case 'moveColumnRight': return move('column', 1).run()
    case 'deleteRow': return chain.deleteRow().run()
    case 'deleteColumn': return chain.deleteColumn().run()
    case 'deleteTable': return chain.deleteTable().run()
  }
}

/** Sets the alignment of the cursor's column, in every cell of it; undefined goes back to the default (`---`). */
export function setColumnAlign(editor: Editor, align: ColumnAlign | undefined): boolean {
  const rect = rectOf(editor.state)
  if (!rect) return false
  return editor.chain().focus().command(({ tr }) => {
    const seen = new Set<number>()
    for (let row = 0; row < rect.map.height; row++) {
      const offset = rect.map.map[row * rect.map.width + rect.left]!
      if (seen.has(offset)) continue
      seen.add(offset)
      const cell = rect.table.nodeAt(offset)
      if (!cell) continue
      const props = { ...(cell.attrs.props as Record<string, unknown> | null) }
      const rest = typeof props.style === 'string' ? props.style.replace(ALIGN, ';').replace(/^;|;$/g, '').trim() : ''
      const style = [rest, align && `text-align:${align}`].filter(Boolean).join(';')
      if (style) props.style = style
      else delete props.style
      tr.setNodeAttribute(rect.tableStart + offset, 'props', props)
    }
    return true
  }).run()
}
