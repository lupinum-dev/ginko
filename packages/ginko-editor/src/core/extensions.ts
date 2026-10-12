// The TipTap extension list for a Markdown profile. Headless: nodes have a minimal `renderHTML` (needed by
// TipTap's `getHTML` and clipboard), no node views, no styles.
//
// Node and mark names are TipTap's own where there is one (paragraph, heading, bold, italic, strike, code,
// link, bulletList, orderedList, listItem, blockquote, codeBlock, horizontalRule, hardBreak, image, table...).
// Ginko's own: alert, taskCheckbox, mathBlock, mathInline, mermaid, component, inlineComponent, slot, raw.
// The attributes that carry what the editor has no field for are described in ./convert.ts.
import type { ComponentRegistry, MarkdownProfile } from '@lupinum/ginko'
import { isSafeHref, profileCovers } from '@lupinum/ginko'
import { Extension, Node, type AnyExtension, type Editor } from '@tiptap/core'
import Blockquote from '@tiptap/extension-blockquote'
import Code from '@tiptap/extension-code'
import Document from '@tiptap/extension-document'
import Image from '@tiptap/extension-image'
import { ListItem } from '@tiptap/extension-list'
import { Table, TableCell, TableHeader, TableRow } from '@tiptap/extension-table'
import { NodeSelection, Plugin, PluginKey, Selection, TextSelection, type EditorState, type Transaction } from '@tiptap/pm/state'
import StarterKit from '@tiptap/starter-kit'
import { MoveExtension } from './move.ts'
import { pasteExtension, type PasteOptions } from './paste.ts'
import { SearchExtension } from './search.ts'
import { uploadPlaceholders } from './uploads.ts'

export interface GinkoExtensionsOptions {
  profile: MarkdownProfile
  /** The site's component registry (`page` profile). The generic component nodes keep it as an option for the UI. */
  components?: ComponentRegistry
  /** What the UI does with pasted or dropped pictures and a pasted bare address (see ./paste.ts). */
  onImageFiles?: PasteOptions['onImageFiles']
  onUrlPasted?: PasteOptions['onUrlPasted']
}

export interface ComponentNodeOptions { components?: ComponentRegistry }

const MARKS = ['bold', 'italic', 'strike', 'code', 'link']
const BLOCKS = ['paragraph', 'heading', 'horizontalRule', 'bulletList', 'orderedList', 'listItem', 'blockquote', 'alert', 'codeBlock', 'mermaid', 'mathBlock',
  'table', 'tableRow', 'tableHeader', 'tableCell', 'component', 'slot']
const INLINES = ['hardBreak', 'image', 'taskCheckbox', 'mathInline', 'inlineComponent']

const rawAttr = { default: {}, rendered: false, keepOnSplit: false }

const atom = (name: string, spec: Record<string, unknown>) => Node.create({ name, ...spec } as never)

const Alert = Node.create({
  name: 'alert',
  group: 'block',
  content: 'block*',
  defining: true,
  addAttributes() { return { type: { default: 'note' } } },
  parseHTML() { return [{ tag: 'div[data-ginko-alert]', getAttrs: (el) => ({ type: (el as HTMLElement).getAttribute('data-ginko-alert') }) }] },
  renderHTML({ node }) { return ['div', { 'data-ginko-alert': node.attrs.type }, 0] },
})

/** The checkbox of a task list item (`- [ ] text`), as the parser writes it. A new one from the slash menu or Enter copies it. */
export const TASK_CHECKBOX_PROPS = { class: 'task-list-item-checkbox', type: 'checkbox', ':disabled': 'true' }

const inTaskItem = (state: EditorState) => {
  const { $from, empty } = state.selection
  const paragraph = $from.parent
  return empty && $from.depth >= 2 && $from.node(-1).type.name === 'listItem' && paragraph.firstChild?.type.name === 'taskCheckbox' ? $from : null
}

const withoutClass = (props: Record<string, unknown> | null | undefined, name: string) => {
  const { class: classes, ...rest } = props ?? {}
  const left = String(classes ?? '').split(/\s+/).filter((c) => c && c !== name).join(' ')
  return left ? { ...rest, class: left } : rest
}

/** Whether the cursor is in a checklist item. */
export const isTaskItem = (state: EditorState) => {
  const { $from } = state.selection
  return $from.depth >= 2 && $from.node(-1).type.name === 'listItem' && $from.parent.firstChild?.type.name === 'taskCheckbox'
}

/**
 * Turns the block at the cursor into a checklist, or a checklist back into a bulleted list. Text or a bulleted list gets an empty
 * box in front of each item; the node shapes are the parser's, so the text reads `- [ ] item`.
 */
export function toggleTaskList(editor: Editor): boolean {
  if (isTaskItem(editor.state)) {
    // Back to a bulleted list: every item loses its box (and the space after it) and the task classes.
    return editor.chain().focus().command(({ tr }) => {
      const { $from } = tr.selection
      const start = $from.before(-2)
      const list = $from.node(-2)
      const items: number[] = []
      list.forEach((_item, offset) => { items.push(start + 1 + offset) })
      for (const at of items.reverse()) {
        const item = tr.doc.nodeAt(at)!
        const para = item.firstChild
        if (para?.firstChild?.type.name === 'taskCheckbox') tr.delete(at + 2, at + 3 + (para.childCount > 1 && para.child(1).text?.startsWith(' ') ? 1 : 0))
        tr.setNodeMarkup(at, undefined, { ...item.attrs, props: withoutClass(item.attrs.props, 'task-list-item') })
      }
      tr.setNodeMarkup(start, undefined, { ...list.attrs, props: withoutClass(list.attrs.props, 'contains-task-list') })
      return true
    }).run()
  }
  if (!editor.isActive('bulletList')) editor.chain().focus().toggleBulletList().run()
  return editor.chain().focus().command(({ tr, state }) => {
    const { $from } = tr.selection
    if ($from.depth < 3 || $from.node(-2).type.name !== 'bulletList') return false
    const start = $from.before(-2)
    const list = $from.node(-2)
    tr.setNodeMarkup(start, undefined, { ...list.attrs, props: { ...(list.attrs.props ?? {}), class: 'contains-task-list' } })
    const adds: number[] = []
    list.forEach((item, offset) => { if (item.firstChild?.type.name === 'paragraph' && item.firstChild.firstChild?.type.name !== 'taskCheckbox') adds.push(start + 1 + offset) })
    for (const at of adds.reverse()) {
      const item = tr.doc.nodeAt(at)!
      tr.setNodeMarkup(at, undefined, { ...item.attrs, props: { ...(item.attrs.props ?? {}), class: 'task-list-item' } })
      tr.insert(at + 2, [state.schema.nodes.taskCheckbox!.create({ checked: false, props: TASK_CHECKBOX_PROPS }), state.schema.text(' ')])
    }
    return true
  }).run()
}

const TaskCheckbox = Node.create({
  name: 'taskCheckbox',
  group: 'inline',
  inline: true,
  atom: true,
  // Before the list item's own Enter, so a new item gets its box.
  priority: 200,
  addAttributes() { return { checked: { default: false } } },
  parseHTML() { return [{ tag: 'input[data-ginko-task]', getAttrs: (el) => ({ checked: (el as HTMLElement).hasAttribute('checked') }) }] },
  renderHTML({ node }) { return ['input', { 'data-ginko-task': '', type: 'checkbox', ...(node.attrs.checked ? { checked: '' } : {}) }] },
  addKeyboardShortcuts() {
    return {
      // Enter in a task item starts the next item with an empty box; in an item with only its box it ends the list.
      Enter: ({ editor }) => {
        const $from = inTaskItem(editor.state)
        if (!$from) return false
        const box = $from.parent.firstChild!
        if (!$from.parent.textContent.trim()) {
          return editor.chain().command(({ tr }) => { tr.delete($from.start(), $from.end()); return true }).liftListItem('listItem').run()
        }
        const item = $from.node(-1)
        return editor.chain().splitListItem('listItem').command(({ tr, state }) => {
          const $at = tr.selection.$from
          // The split item does not keep its attributes; the writer needs the task item's class to write `[ ]`.
          tr.setNodeMarkup($at.before(-1), undefined, item.attrs)
          const at = $at.start()
          tr.insert(at, [box.type.create({ ...box.attrs, checked: false }), state.schema.text(' ')])
          tr.setSelection(TextSelection.create(tr.doc, at + 2))
          return true
        }).run()
      },
    }
  },
  addProseMirrorPlugins() {
    return [new Plugin({
      key: new PluginKey('ginkoTaskCheckbox'),
      props: {
        // A click ticks or clears the box: an edit like any other, so undo works.
        handleClickOn(view, _pos, node, nodePos) {
          if (node.type.name !== 'taskCheckbox' || !view.editable) return false
          view.dispatch(view.state.tr.setNodeMarkup(nodePos, undefined, { ...node.attrs, checked: !node.attrs.checked }))
          return true
        },
      },
    })]
  },
})

/** Code-like blocks: the text is the content, no marks. */
const codeLike = (name: string) => Node.create({
  name,
  group: 'block',
  content: 'text*',
  marks: '',
  code: true,
  defining: true,
  parseHTML() { return [{ tag: `pre[data-ginko-${name}]`, preserveWhitespace: 'full' as const }] },
  renderHTML() { return ['pre', { [`data-ginko-${name}`]: '' }, 0] },
})

const MathInline = atom('mathInline', {
  group: 'inline',
  inline: true,
  atom: true,
  addAttributes() { return { text: { default: '' } } },
  parseHTML() { return [{ tag: 'span[data-ginko-math]', getAttrs: (el: HTMLElement) => ({ text: el.textContent ?? '' }) }] },
  renderHTML({ node }: { node: { attrs: { text: string } } }) { return ['span', { 'data-ginko-math': '' }, node.attrs.text] },
})

const Raw = atom('raw', {
  group: 'block',
  atom: true,
  addAttributes() { return { node: { default: null, rendered: false }, markdown: { default: '', rendered: false } } },
  parseHTML() { return [{ tag: 'pre[data-ginko-raw]' }] },
  renderHTML({ node }: { node: { attrs: { markdown: string } } }) { return ['pre', { 'data-ginko-raw': '' }, node.attrs.markdown] },
})

const Component = Node.create<ComponentNodeOptions>({
  name: 'component',
  group: 'block',
  // Slots (`::callout` with `#footer`) are children of the component node, the rest is its default slot.
  content: '(block | slot)*',
  defining: true,
  addOptions() { return {} },
  addAttributes() { return { tag: { default: '' } } },
  parseHTML() { return [{ tag: 'div[data-ginko-component]', getAttrs: (el) => ({ tag: (el as HTMLElement).getAttribute('data-ginko-component') }) }] },
  renderHTML({ node }) { return ['div', { 'data-ginko-component': node.attrs.tag }, 0] },
})

const InlineComponent = Node.create<ComponentNodeOptions>({
  name: 'inlineComponent',
  group: 'inline',
  inline: true,
  content: 'inline*',
  addOptions() { return {} },
  addAttributes() { return { tag: { default: '' } } },
  parseHTML() { return [{ tag: 'span[data-ginko-inline-component]', getAttrs: (el) => ({ tag: (el as HTMLElement).getAttribute('data-ginko-inline-component') }) }] },
  renderHTML({ node }) { return ['span', { 'data-ginko-inline-component': node.attrs.tag }, 0] },
})

const Slot = Node.create({
  name: 'slot',
  content: 'block*',
  defining: true,
  isolating: true,
  addAttributes() { return { name: { default: 'default' } } },
  parseHTML() { return [{ tag: 'div[data-ginko-slot]', getAttrs: (el) => ({ name: (el as HTMLElement).getAttribute('data-ginko-slot') }) }] },
  renderHTML({ node }) { return ['div', { 'data-ginko-slot': node.attrs.name }, 0] },
})

/** Attributes and schema details shared by all nodes: see ./convert.ts for what each one holds. */
function schemaExtension(): AnyExtension {
  return Extension.create({
    name: 'ginkoSchema',
    addGlobalAttributes() {
      return [
        { types: [...BLOCKS, ...INLINES, ...MARKS], attributes: { props: rawAttr } },
        { types: ['paragraph'], attributes: { bare: { default: false, rendered: false } } },
        // The sample text of an inserted component: shown muted while the block is empty, never saved (see slash.ts).
        {
          types: ['paragraph', 'heading'],
          attributes: {
            placeholder: {
              default: null,
              keepOnSplit: false,
              parseHTML: (el: HTMLElement) => el.getAttribute('data-placeholder'),
              renderHTML: (attrs: Record<string, unknown>) => (attrs.placeholder ? { 'data-placeholder': String(attrs.placeholder) } : {}),
            },
          },
        },
        { types: MARKS, attributes: { order: { default: null, rendered: false } } },
        { types: ['link'], attributes: { title: { default: null, rendered: false } } },
        { types: ['codeBlock'], attributes: { filename: { default: null, rendered: false }, codeProps: { default: {}, rendered: false, keepOnSplit: false } } },
        { types: ['table'], attributes: { theadProps: rawAttr, tbodyProps: rawAttr } },
      ]
    },
  })
}

const trailingKey = new PluginKey('ginkoTrailingParagraph')

/**
 * A document always ends with a paragraph, so the cursor can go below a last list, table or component. The
 * paragraph is only there to be typed into: `createGinkoEditor` leaves it out of the saved Markdown while it is empty.
 */
function trailingParagraph(): AnyExtension {
  return Extension.create({
    name: 'ginkoTrailingParagraph',
    addProseMirrorPlugins() {
      return [new Plugin({
        key: trailingKey,
        appendTransaction(transactions, _before, state) {
          if (!transactions.some((tr) => tr.docChanged)) return null
          const last = state.doc.lastChild
          if (!last || last.type.name === 'paragraph') return null
          return state.tr.insert(state.doc.content.size, state.schema.nodes.paragraph!.create())
        },
      })]
    },
  })
}

const isComponent = (state: EditorState) => state.selection instanceof NodeSelection && state.selection.node.type.name === 'component'

/**
 * Selected component block: typing does not replace it (only Backspace and Delete remove it). A triple click
 * selects the text of the clicked block and nothing beyond it.
 */
function blockSelectionGuard(): AnyExtension {
  return Extension.create({
    name: 'ginkoBlockSelectionGuard',
    addProseMirrorPlugins() {
      return [new Plugin({
        key: new PluginKey('ginkoBlockSelectionGuard'),
        props: {
          handleKeyDown: (view, event) => isComponent(view.state) && event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey,
          handleTextInput: (view) => isComponent(view.state),
          handleDOMEvents: {
            beforeinput: (view, event) => {
              if (!isComponent(view.state) || !(event as InputEvent).inputType?.startsWith('insert')) return false
              event.preventDefault()
              return true
            },
          },
          handleTripleClick: (view, pos) => {
            const $pos = view.state.doc.resolve(pos)
            if (!$pos.parent.isTextblock) return false
            view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, $pos.start(), $pos.end())))
            return true
          },
        },
      })]
    },
  })
}

/**
 * ArrowDown at the end of the text, or Enter in an empty last paragraph, leaves the component: the cursor goes to
 * the next block (a paragraph is added when there is none). Without it the cursor cannot leave a box at the end of a text.
 */
export function leaveComponent(state: EditorState, key: 'ArrowDown' | 'Enter'): ((tr: Transaction) => void) | undefined {
  const { selection } = state
  if (!(selection instanceof TextSelection) || !selection.empty) return undefined
  const { $from } = selection
  const textblock = $from.parent
  if (!textblock.isTextblock || $from.parentOffset !== textblock.content.size) return undefined
  if (key === 'Enter') {
    const container = $from.node($from.depth - 1).type.name
    if (textblock.type.name !== 'paragraph' || textblock.content.size !== 0 || !(container === 'component' || container === 'slot') || $from.index($from.depth - 1) === 0) return undefined
  }
  // The block is the last thing in the component all the way up: every level between ends right here.
  const lastIn = (depth: number) => $from.end(depth) - $from.end() === $from.depth - depth
  let after: number | undefined
  for (let depth = $from.depth; depth > 0; depth--) {
    if ($from.node(depth).type.name !== 'component') continue
    if (!lastIn(depth)) { if (after === undefined) return undefined; break }
    after = $from.after(depth)
    if (state.doc.resolve(after).nodeAfter) break
  }
  if (after === undefined) return undefined
  const target = after
  return (tr) => {
    let at = target
    if (key === 'Enter') { tr.delete($from.before(), $from.after()); at = tr.mapping.map(target) }
    if (tr.doc.resolve(at).nodeAfter) tr.setSelection(Selection.near(tr.doc.resolve(at), 1))
    else { tr.insert(at, state.schema.nodes.paragraph!.create()); tr.setSelection(TextSelection.create(tr.doc, at + 1)) }
    tr.scrollIntoView()
  }
}

function componentKeys(): AnyExtension {
  return Extension.create({
    name: 'ginkoLeaveComponent',
    priority: 1000,
    addKeyboardShortcuts() {
      const leave = (key: 'ArrowDown' | 'Enter') => () => {
        const { state, view } = this.editor
        const apply = leaveComponent(state, key)
        if (!apply) return false
        const tr = state.tr
        apply(tr)
        view.dispatch(tr)
        // A box drawn by the UI may keep its text in a nested editing host; the focus must follow the cursor out of it.
        if (!view.hasFocus()) view.focus()
        return true
      }
      return { ArrowDown: leave('ArrowDown'), Enter: leave('Enter') }
    },
  })
}

/** The extensions for exactly what `profile` allows (see `describeProfile` in @lupinum/ginko). */
export function ginkoExtensions(options: GinkoExtensionsOptions): AnyExtension[] {
  const { profile, components, onImageFiles, onUrlPasted } = options
  const covers = (narrow: MarkdownProfile) => profileCovers(profile, narrow)
  const basic = covers('basic')
  const rich = covers('rich')
  const page = covers('page')
  const extensions: AnyExtension[] = [
    StarterKit.configure({
      // inline
      bold: {}, italic: {}, strike: {}, hardBreak: {}, paragraph: {},
      // Replaced below by versions with another content rule.
      document: false, code: false, listItem: false, blockquote: false,
      link: { openOnClick: false, autolink: false, linkOnPaste: false, isAllowedUri: (url: string) => isSafeHref(url), HTMLAttributes: { target: null, rel: null, class: null } },
      // basic
      heading: basic ? { levels: page ? [1, 2, 3, 4, 5, 6] : [2, 3, 4] } : false,
      bulletList: basic ? {} : false,
      orderedList: basic ? {} : false,
      listKeymap: basic ? {} : false,
      horizontalRule: basic ? {} : false,
      codeBlock: rich ? {} : false,
      // Markdown has no underline; the editor must not add a trailing paragraph (it would change the text).
      underline: false,
      trailingNode: false,
    }),
    schemaExtension(),
    // The inline profile is one paragraph.
    Document.extend({ content: profile === 'inline' ? 'paragraph' : 'block+' }),
    // Markdown allows `**`x`**` and a link around code; TipTap's code mark excludes all other marks.
    Code.extend({ excludes: '' }),
  ]
  // A list item or quote may start with a nested list, or be empty (`- [ ]`); so may a table cell (below).
  if (basic) extensions.push(ListItem.extend({ content: 'block*' }), Blockquote.extend({ content: 'block*' }))
  if (basic) extensions.push(Alert, Raw, TaskCheckbox)
  if (rich) {
    extensions.push(
      Table.configure({ resizable: false }), TableRow, TableHeader.extend({ content: 'block*' }), TableCell.extend({ content: 'block*' }),
      Image.configure({ inline: true, allowBase64: false }),
      MathInline, codeLike('mathBlock'), codeLike('mermaid'), uploadPlaceholders(),
    )
  }
  if (page) extensions.push(Component.configure({ components }), InlineComponent.configure({ components }), Slot, componentKeys())
  extensions.push(SearchExtension)
  if (profile !== 'inline') extensions.push(trailingParagraph(), blockSelectionGuard(), MoveExtension)
  extensions.push(pasteExtension({ profile, components, onImageFiles: rich ? onImageFiles : undefined, onUrlPasted }))
  return extensions
}
