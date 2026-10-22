// What the Studio adds to the headless extensions: the node view of components, Mod+K, and the slash menu.
// Nothing here changes the schema (see `extend` in createGinkoEditor).
import type { ComponentRegistry, Msg } from '@lupinum/ginko/internal'
import { docProblems, filterSlashItems, type DocProblem, type SlashItem } from '@lupinum/ginko-editor'
import { Extension, type AnyExtension, type Editor } from '@tiptap/core'
import { NodeSelection, Plugin, PluginKey, TextSelection } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import type { Node as PmNode } from '@tiptap/pm/model'
import Suggestion from '@tiptap/suggestion'
import { VueNodeViewRenderer } from '@tiptap/vue-3'
import { watch } from 'vue'
import type { SettingsBus } from './context.ts'
import ComponentView from './ComponentView.vue'
import InlineComponentView from './InlineComponentView.vue'

/** The state of the open slash menu; `SlashMenu.vue` draws it, the Suggestion plugin below fills it. */
export interface SlashState {
  open: boolean
  items: SlashItem[]
  selected: number
  query: string
  /** Where the typed `/` is, in viewport coordinates. */
  rect: (() => DOMRect | null) | null
  choose: (item: SlashItem) => void
}

export const createSlashState = (): SlashState => ({ open: false, items: [], selected: 0, query: '', rect: null, choose: () => {} })

/** The translator of the Studio (`useI18n().t`); the problem notes are plain DOM, outside Vue. */
type Translate = (key: 'editor.fix' | 'editor.fixAt', params?: { message: string }) => string

export interface StudioExtensionsOptions {
  components?: ComponentRegistry
  slashItems: () => SlashItem[]
  slash: SlashState
  openLink: () => void
  /** Where the keyboard and the slash menu ask a component block to open its settings. */
  bus: SettingsBus
  /**
   * The registry for the check of component props, what "Beheben" does with a problem, and whether a picture without
   * its own text has one from the Files library (reactive: the notes follow when the library's files arrive).
   */
  problems?: { registry: () => ComponentRegistry | undefined; fix: (problem: DocProblem) => void; t: Translate; text: (message: Msg) => string; described?: (src: string) => boolean }
}

export function studioExtensions({ slashItems, slash, openLink, bus, problems }: StudioExtensionsOptions) {
  return (base: AnyExtension[]): AnyExtension[] => {
    const extensions = base.map((ext) => {
      if (ext.name === 'component') return componentExtension(ext as AnyExtension, slash, bus)
      // An inline component without text of its own (a fact) is a chip that names it, not an empty box.
      if (ext.name === 'inlineComponent') return (ext as AnyExtension).extend({ addNodeView() { return VueNodeViewRenderer(InlineComponentView) } }).configure({ bus } as never)
      return ext
    })
    // Every profile has links (the link mark comes with StarterKit, so it is not an extension of its own in `base`).
    extensions.push(Extension.create({ name: 'ginkoLinkKey', addKeyboardShortcuts() { return { 'Mod-k': () => { openLink(); return true } } } }))
    if (problems) extensions.push(problemsExtension(problems))
    extensions.push(escapeExtension())
    // A click (or tap) on a link opens its address instead of following it: the address is visible and can be changed.
    extensions.push(Extension.create({
      name: 'ginkoLinkClick',
      addProseMirrorPlugins() {
        return [new Plugin({
          key: new PluginKey('ginkoLinkClick'),
          props: {
            handleClick: (view, pos, event) => {
              const anchor = (event.target as HTMLElement | null)?.closest?.('a')
              if (!anchor || !view.dom.contains(anchor)) return false
              // The caret goes inside the link, so the popover finds its address.
              const from = view.posAtDOM(anchor, 0)
              const to = from + (anchor.textContent?.length ?? 0)
              const inside = to - from >= 2 ? Math.min(Math.max(pos, from + 1), to - 1) : from
              view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, inside)))
              openLink()
              return true
            },
          },
        })]
      },
    }))
    if (slashItems().length) {
      extensions.push(Extension.create({
        name: 'ginkoSlash',
        addProseMirrorPlugins() {
          return [Suggestion<SlashItem, SlashItem>({
            editor: this.editor,
            pluginKey: new PluginKey('ginkoSlash'),
            char: '/',
            startOfLine: true,
            // Only in running text, not in a code block.
            allow: ({ state, range }) => state.doc.resolve(range.from).parent.type.name === 'paragraph',
            items: ({ query }) => filterSlashItems(slashItems(), query),
            command: ({ editor, range, props }) => {
              editor.chain().focus().deleteRange(range).run()
              void props.run(editor)
            },
            render: () => {
              const sync = (p: { items: SlashItem[]; query: string; clientRect?: (() => DOMRect | null) | null; command: (item: SlashItem) => void }) => {
                slash.open = true
                slash.items = p.items
                slash.query = p.query
                slash.rect = p.clientRect ?? null
                slash.choose = p.command
                slash.selected = Math.min(slash.selected, Math.max(p.items.length - 1, 0))
              }
              return {
                onStart: (p) => { slash.selected = 0; sync(p) },
                onUpdate: (p) => { sync(p) },
                onExit: () => { slash.open = false },
                onKeyDown: ({ event }) => {
                  if (event.key === 'Escape') { slash.open = false; return true }
                  const count = slash.items.length
                  if (!count) return false
                  if (event.key === 'ArrowDown') { slash.selected = (slash.selected + 1) % count; return true }
                  if (event.key === 'ArrowUp') { slash.selected = (slash.selected - 1 + count) % count; return true }
                  if (event.key === 'Enter') { slash.choose(slash.items[slash.selected]!); return true }
                  return false
                },
              }
            },
          })]
        },
      }))
    }
    return extensions
  }
}

/**
 * Escape that nothing in the text takes (the slash menu, the block keymap) reaches the page uncancelled. ProseMirror
 * cancels every Escape it gets, so a task sheet never heard the key and neither closed nor asked "Änderungen
 * verwerfen?" while the focus was in a text. Here the editor's key handlers still get Escape first, as ProseMirror would
 * call them; only its blanket cancel goes. Last in line, so other DOM key handlers of the editor run before it.
 */
function escapeExtension(): AnyExtension {
  return Extension.create({
    name: 'ginkoEscape',
    priority: 1,
    addProseMirrorPlugins() {
      return [new Plugin({
        key: new PluginKey('ginkoEscape'),
        props: {
          handleDOMEvents: {
            keydown: (view, event) => {
              // Same gate as ProseMirror's own key handling: no edit keys while composing or in a read-only text.
              if (event.key !== 'Escape' || event.isComposing || view.composing || !view.editable) return false
              if (view.someProp('handleKeyDown', (handle) => handle(view, event))) event.preventDefault()
              return true
            },
          },
        },
      })]
    },
  })
}

/**
 * The `component` node with its node view. Keys: Escape selects the block around the cursor (a second Escape the
 * block around that), Enter on a selected block opens its settings. The slash menu keeps Escape while it is open.
 */
function componentExtension(ext: AnyExtension, slash: SlashState, bus: SettingsBus): AnyExtension {
  return ext.extend({
    addNodeView() { return VueNodeViewRenderer(ComponentView) },
    addKeyboardShortcuts() {
      return {
        Enter: ({ editor }: { editor: Editor }) => {
          const { selection } = editor.state
          if (!(selection instanceof NodeSelection) || selection.node.type.name !== 'component') return false
          bus.request = { pos: selection.from, missing: [] }
          return true
        },
        Escape: ({ editor }: { editor: Editor }) => {
          if (slash.open) return false
          const { $from } = editor.state.selection
          for (let depth = $from.depth; depth > 0; depth--) {
            if ($from.node(depth).type.name === 'component') {
              const selected = editor.commands.setNodeSelection($from.before(depth))
              // The text of a drawn box is a nested editing host: the focus has to come out of it, or typing goes on in the box.
              editor.view.focus()
              return selected
            }
          }
          return false
        },
      }
    },
  }).configure({ bus } as never)
}

/**
 * Problems at the block: a block with an invalid component prop or a picture without description gets a red left
 * border (class `ginko-problem`), and a note with "Beheben" under it. The note is a widget, not part of the document.
 */
function problemsExtension({ registry, fix, t, text, described }: NonNullable<StudioExtensionsOptions['problems']>): AnyExtension {
  const key = new PluginKey<DecorationSet>('ginkoProblems')
  const note = (problem: DocProblem): HTMLElement => {
    const el = document.createElement('div')
    el.className = 'ginko-problem-note'
    el.setAttribute('contenteditable', 'false')
    el.setAttribute('role', 'note')
    // The core's problems carry a catalog key; the Studio says them in the person's language.
    const message = text(problem)
    const span = document.createElement('span')
    span.textContent = message
    const button = document.createElement('button')
    button.type = 'button'
    button.textContent = t('editor.fix')
    button.setAttribute('aria-label', t('editor.fixAt', { message }))
    // The editor keeps its selection while the button is used.
    button.addEventListener('mousedown', (event) => event.preventDefault())
    button.addEventListener('click', () => fix(problem))
    el.append(span, button)
    return el
  }
  const build = (doc: PmNode): DecorationSet => {
    const found = docProblems(doc, registry(), described)
    if (!found.length) return DecorationSet.empty
    const decorations: Decoration[] = []
    const seen = new Set<number>()
    doc.forEach((block, offset, index) => {
      const first = found.find((p) => p.index === index)
      if (!first || seen.has(index)) return
      seen.add(index)
      decorations.push(Decoration.node(offset, offset + block.nodeSize, { class: 'ginko-problem' }))
      decorations.push(Decoration.widget(offset + block.nodeSize, () => note(first), { side: -1, key: `problem-${index}-${first.message}` }))
    })
    return DecorationSet.create(doc, decorations)
  }
  return Extension.create({
    name: 'ginkoProblems',
    addProseMirrorPlugins() {
      return [new Plugin<DecorationSet>({
        key,
        state: { init: (_config, state) => build(state.doc), apply: (tr, old) => (tr.docChanged || tr.getMeta(key) ? build(tr.doc) : old) },
        props: { decorations: (state) => key.getState(state) },
        // A picture's library description arrives after the text opens: when it changes what is described, the notes follow.
        view: (view) => ({
          destroy: described
            ? watch(() => docProblems(view.state.doc, undefined, described).map((p) => p.pos).join(), () => { if (!view.isDestroyed) view.dispatch(view.state.tr.setMeta(key, true)) })
            : undefined,
        }),
      })]
    },
  })
}
