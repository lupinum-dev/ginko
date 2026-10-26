// The entries of the slash menu ("/" in an empty paragraph), as data: what the profile allows, how each one
// changes the document. Headless, the Studio only draws them.
import type { Label } from '@lupinum/ginko'
import type { ComponentRegistry, MarkdownProfile } from '@lupinum/ginko/internal'
import { labelOf, parseMarkdown, profileCovers, URL_PROPS } from '@lupinum/ginko/internal'
import type { Editor, Range } from '@tiptap/core'
import type { Node as PmNode } from '@tiptap/pm/model'
import { NodeSelection, TextSelection, type EditorState, type SelectionBookmark } from '@tiptap/pm/state'
import { editorMeta, missingRequired, type ComponentProps, type PropField } from './component-props.ts'
import { toEditorDoc, type GinkoDocNode } from './convert.ts'
import { toggleTaskList } from './extensions.ts'
import { inTableCell } from './table.ts'

export interface SlashItem {
  /** Stable key: `heading2`, `bulletList`, ... and `component:<tag>`. */
  id: string
  label: string
  /** One short line under the label. */
  describe: string
  /** Heading of the group in the menu. */
  group: string
  /** More words the filter finds this item by. */
  keywords: string[]
  /**
   * `style` turns the block at the cursor into this one (a heading, a list); `insert` adds something new (a component, a
   * table). From the toolbar an insert goes below a block that has text, like "/" on a new line would.
   */
  kind: 'style' | 'insert'
  /** Changes the document at the cursor. The caller has already removed the typed `/query`. */
  run(editor: Editor): void | Promise<void>
}

export interface SlashItemsOptions {
  profile: MarkdownProfile
  components?: ComponentRegistry
  /** The "Bild" item has no text to insert: the UI asks for a picture. Without it the item does nothing. */
  pickImage?: (editor: Editor) => void
  /**
   * Called after a component was inserted whose registry example leaves a required prop empty. The UI asks for
   * those props right away. Not called when the example fills every required prop.
   */
  onNeedsProps?: (insert: InsertedComponent) => void
  /** The reader's language for the registry's labels, descriptions and groups (per-language texts). */
  locale?: string
}

export interface InsertedComponent {
  editor: Editor
  tag: string
  /** Position of the component node in the document. */
  pos: number
  /** Keys of the required props that have no valid value yet. */
  missing: string[]
}

export const SLASH_TEXT_GROUP = 'Text'
export const SLASH_COMPONENT_GROUP = 'Komponenten'

/** The words for the three heading levels, here and in the toolbar of the Studio. */
export const HEADING_LABELS = { 2: 'Überschrift', 3: 'Unterüberschrift', 4: 'Kleine Überschrift' } as const

const heading = (level: 2 | 3 | 4): SlashItem => ({
  id: `heading${level}`,
  label: HEADING_LABELS[level],
  describe: level === 2 ? 'Große Überschrift für einen neuen Abschnitt' : level === 3 ? 'Kleinere Überschrift innerhalb eines Abschnitts' : 'Kleinste Überschrift',
  group: SLASH_TEXT_GROUP,
  // "Zwischenüberschrift" is the usual word for a section heading, so search finds level 2 with it.
  keywords: ['titel', 'heading', `h${level}`, ...(level === 2 ? ['zwischenüberschrift'] : [])],
  kind: 'style',
  // Toggles, so the toolbar's checked entry turns the block back into text; in an empty paragraph (the "/" menu) it is the same as set.
  run: (editor) => { editor.chain().focus().toggleHeading({ level }).run() },
})

/** The entries for what `profile` allows, in menu order. The inline profile (one paragraph) has none. */
export function slashItems(options: SlashItemsOptions): SlashItem[] {
  const { profile, components, pickImage, onNeedsProps, locale = '' } = options
  const text = (label: Label) => labelOf(label, locale, locale)
  const covers = (narrow: MarkdownProfile) => profileCovers(profile, narrow)
  const items: SlashItem[] = []
  if (covers('basic')) {
    items.push(
      heading(2), heading(3), heading(4),
      { id: 'bulletList', label: 'Aufzählung', describe: 'Liste mit Punkten', group: SLASH_TEXT_GROUP, keywords: ['liste', 'punkte', 'bullet'], kind: 'style', run: (e) => { e.chain().focus().toggleBulletList().run() } },
      { id: 'orderedList', label: 'Nummerierte Liste', describe: 'Liste mit Zahlen', group: SLASH_TEXT_GROUP, keywords: ['liste', 'zahlen', 'schritte'], kind: 'style', run: (e) => { e.chain().focus().toggleOrderedList().run() } },
      { id: 'taskList', label: 'Checkliste', describe: 'Liste mit Kästchen zum Abhaken', group: SLASH_TEXT_GROUP, keywords: ['aufgaben', 'todo', 'checkbox', 'kästchen'], kind: 'style', run: (e) => { toggleTaskList(e) } },
      { id: 'blockquote', label: 'Zitat', describe: 'Eingerückter Text, zum Beispiel eine Stimme', group: SLASH_TEXT_GROUP, keywords: ['quote', 'zitieren'], kind: 'style', run: (e) => { e.chain().focus().toggleBlockquote().run() } },
      { id: 'horizontalRule', label: 'Trennlinie', describe: 'Eine Linie zwischen zwei Abschnitten', group: SLASH_TEXT_GROUP, keywords: ['linie', 'strich', 'trenner'], kind: 'insert', run: (e) => { e.chain().focus().setHorizontalRule().run() } },
    )
  }
  if (covers('rich')) {
    items.push(
      { id: 'table', label: 'Tabelle', describe: 'Zeilen und Spalten', group: SLASH_TEXT_GROUP, keywords: ['raster', 'zeilen', 'spalten'], kind: 'insert', run: (e) => { e.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run() } },
      { id: 'codeBlock', label: 'Codeblock', describe: 'Text in fester Schrift, für Code', group: SLASH_TEXT_GROUP, keywords: ['code', 'quelltext'], kind: 'style', run: (e) => { e.chain().focus().toggleCodeBlock().run() } },
      { id: 'image', label: 'Bild', describe: 'Ein Bild mit Beschreibung einfügen', group: SLASH_TEXT_GROUP, keywords: ['foto', 'grafik', 'bild'], kind: 'insert', run: (e) => { pickImage?.(e) } },
    )
  }
  if (covers('page') && components) {
    for (const [tag, def] of Object.entries(components)) {
      // A component that lives inside another one (a tab) is added through its container; a short form (`hidden`) is
      // reached through its long form. One without an example inserts its bare tag.
      if (def.kind !== 'block' || def.parents?.length || editorMeta(def).hidden) continue
      items.push({
        id: `component:${tag}`,
        label: text(def.label),
        describe: text(def.describe),
        group: def.editor?.group === undefined ? SLASH_COMPONENT_GROUP : text(def.editor.group),
        keywords: [tag, ...(editorMeta(def).keywords ?? [])],
        kind: 'insert',
        async run(editor) {
          const { from, to } = editor.state.selection
          await insertComponent(editor, { tag, profile, components, at: { from, to }, onNeedsProps })
        },
      })
    }
  }
  // One entry per id, and one per label inside a group: two entries of the same name are a menu nobody can choose from.
  const seen = new Set<string>()
  return items.filter((item) => {
    const keys = [`id:${item.id}`, `label:${item.group}:${item.label.toLowerCase()}`]
    if (keys.some((key) => seen.has(key))) return false
    keys.forEach((key) => seen.add(key))
    return true
  })
}

/**
 * The items that can go at the cursor, for the "/" menu and the toolbar alike. A GFM table cell holds one line of
 * inline text, so there only the picture is offered: a heading, list or component there would not survive the save.
 */
export function slashItemsAt(items: readonly SlashItem[], state: EditorState): SlashItem[] {
  return inTableCell(state) ? items.filter((item) => item.id === 'image') : [...items]
}

/**
 * Runs `item` from a menu that does not sit in an empty line (the toolbar). An insert in a block with text goes into a
 * new empty paragraph below that block, so the text stays whole; everything else runs where the cursor is.
 */
export function runSlashItem(editor: Editor, item: SlashItem): void | Promise<void> {
  const { selection } = editor.state
  const parent = selection.$from.parent
  // A selected block (a component) stays too: the new one goes below it. In a table cell the picture goes in the line
  // (a cell holds one line).
  const below = inTableCell(editor.state) ? undefined
    : selection instanceof NodeSelection ? selection.to
    : parent.isTextblock && (parent.type.name !== 'paragraph' || parent.content.size > 0) ? selection.$from.after() : undefined
  if (item.kind === 'insert' && below !== undefined) {
    const back = selection.getBookmark()
    editor.chain().insertContentAt(below, { type: 'paragraph' }).setTextSelection(below + 1).run()
    blanks.set(editor, { doc: editor.state.doc, pos: below, back })
  }
  const done = item.run(editor)
  // The picture opens a dialog: MarkdownEditor drops the blank line when it closes without a picture.
  if (item.id === 'image') return done
  if (done instanceof Promise) return done.then(() => dropSlashBlank(editor))
  dropSlashBlank(editor)
}

// The empty paragraph `runSlashItem` made for an insert, kept with the text it was made in.
const blanks = new WeakMap<Editor, { doc: PmNode; pos: number; back: SelectionBookmark }>()

/**
 * Takes back the empty paragraph `runSlashItem` added for an insert, when the insert did not happen (a component without
 * an example, a closed picture dialog): the text is still the one it was made in. The cursor goes back where it was.
 */
export function dropSlashBlank(editor: Editor): void {
  const blank = blanks.get(editor)
  blanks.delete(editor)
  if (!blank || editor.isDestroyed || editor.state.doc !== blank.doc) return
  const tr = editor.state.tr.delete(blank.pos, blank.pos + 2)
  editor.view.dispatch(tr.setSelection(blank.back.resolve(tr.doc)))
}

export interface InsertComponentOptions {
  tag: string
  profile: MarkdownProfile
  components: ComponentRegistry
  /** Where it goes: a position between blocks, or the range of the empty paragraph the menu was opened in (replaced). */
  at: number | Range
  /**
   * A child added inside its container (a tab in tabs): taken from the child's example, which may wrap it in its
   * container. Its sample texts go like those of any insert (no second tab named "Erster"): the settings ask for them.
   */
  child?: boolean
  /** Called when the inserted component has required props without a valid value (see `SlashItemsOptions`). */
  onNeedsProps?: (insert: InsertedComponent) => void
}

/**
 * Inserts the component `tag` as its registry example shows it, without the sample text (that shows as a placeholder).
 * Without an example, the bare `::tag` (no text line). Then asks for missing required props, or puts the cursor in the
 * first empty text block. Resolves to the inserted component.
 */
export async function insertComponent(editor: Editor, options: InsertComponentOptions): Promise<InsertedComponent | undefined> {
  const { tag, profile, components, at, child = false, onNeedsProps } = options
  const content = await componentSkeleton(tag, components, profile, child)
  if (!content.length) return undefined
  editor.chain().focus().insertContentAt(at, content).run()
  // In an empty paragraph the component replaces it, so it starts one position before the cursor.
  const inserted = firstComponentFrom(editor, typeof at === 'number' ? at : at.from - 1)
  if (!inserted) return undefined
  const missing = missingRequired(components, inserted.tag, inserted.props)
  if (missing.length) onNeedsProps?.({ editor, tag: inserted.tag, pos: inserted.pos, missing })
  else focusFirstBlank(editor, inserted.pos)
  return { editor, tag: inserted.tag, pos: inserted.pos, missing }
}

/** The editor nodes for a new `tag`: its example (or the bare tag) without sample text. A child is found inside its example. */
async function componentSkeleton(tag: string, components: ComponentRegistry, profile: MarkdownProfile, child: boolean): Promise<GinkoDocNode[]> {
  const def = Object.hasOwn(components, tag) ? components[tag] : undefined
  const example = def?.editor?.example ?? `::${tag}\n::`
  const parsed = await parseMarkdown(example, { profile, components })
  const nodes = toEditorDoc(parsed.value.nodes, { components }).content ?? []
  const own = child ? [findComponent(nodes, tag) ?? { type: 'component', attrs: { tag, props: {} }, content: [] }] : nodes
  return own.map((node) => blankSample(node, components, false)).filter((node): node is GinkoDocNode => node !== undefined)
}

/** The first `component` node of `tag` in `nodes`, depth first. */
function findComponent(nodes: readonly GinkoDocNode[], tag: string): GinkoDocNode | undefined {
  for (const node of nodes) {
    if (node.type === 'component' && node.attrs?.tag === tag) return node
    const inner = findComponent(node.content ?? [], tag)
    if (inner) return inner
  }
  return undefined
}

/** Props that hold an address: they stay as in the example (a value that is valid), unlike a title or a caption. */
const isAddress = (key: string, field: PropField) => URL_PROPS.has(key) || (field.type === 'text' && field.format === 'url')

const TEXTBLOCKS = new Set(['paragraph', 'heading'])
const INLINE_LEAVES = new Set(['text', 'hardBreak', 'image', 'taskCheckbox', 'mathInline', 'inlineComponent'])

const plainText = (node: GinkoDocNode): string => node.text ?? (node.content ?? []).map(plainText).join('')

/**
 * `node` of an example without its sample text. Text blocks become empty and keep their old text as the
 * attribute `placeholder` (the editor shows it muted while the block is empty). A component keeps its props,
 * except sample prose: a text prop that is not an address (a title, a caption). A required text prop of a
 * component inside another one (the name of a tab) stays, so the structure is valid at once.
 */
function blankSample(node: GinkoDocNode, registry: ComponentRegistry, nested: boolean): GinkoDocNode | undefined {
  if (INLINE_LEAVES.has(node.type)) return undefined
  if (TEXTBLOCKS.has(node.type)) {
    const { content: _, ...rest } = node
    const text = plainText(node).trim()
    return text ? { ...rest, attrs: { ...node.attrs, placeholder: text } } : rest
  }
  if (node.type === 'codeBlock' || node.type === 'mathBlock' || node.type === 'mermaid') {
    const { content: _, ...rest } = node
    return rest
  }
  const next: GinkoDocNode = { ...node }
  if (node.type === 'component') {
    const def = Object.hasOwn(registry, String(node.attrs?.tag)) ? registry[String(node.attrs?.tag)] : undefined
    const kept: ComponentProps = {}
    for (const [name, raw] of Object.entries((node.attrs?.props ?? {}) as ComponentProps)) {
      const key = name.replace(/^:/, '')
      const field = def && Object.hasOwn(def.props, key) ? def.props[key] as PropField : undefined
      const prose = field !== undefined && (field.type === 'text' || field.type === 'longtext') && !isAddress(key, field) && (!nested || field.optional)
      if (!prose) kept[name] = raw
    }
    next.attrs = { ...node.attrs, props: kept }
  }
  if (node.content) next.content = node.content.map((child) => blankSample(child, registry, nested || node.type === 'component')).filter((child): child is GinkoDocNode => child !== undefined)
  return next
}

/** Puts the cursor into the first empty text block of the component at `pos`. */
function focusFirstBlank(editor: Editor, pos: number): void {
  const { doc } = editor.state
  const node = doc.nodeAt(pos)
  if (!node) return
  let target: number | undefined
  node.descendants((child, offset) => {
    if (target !== undefined) return false
    if (child.isTextblock && child.content.size === 0) { target = pos + 1 + offset + 1; return false }
    return true
  })
  if (target !== undefined) editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(doc, target)))
}

/** The first `component` node that starts at or after `from` (the insertion point), or undefined. */
function firstComponentFrom(editor: Editor, from: number): { pos: number; tag: string; props: ComponentProps } | undefined {
  const { doc } = editor.state
  let found: { pos: number; tag: string; props: ComponentProps } | undefined
  doc.nodesBetween(Math.max(0, from), doc.content.size, (node, pos) => {
    if (found) return false
    if (node.type.name === 'component' && pos >= from) found = { pos, tag: String(node.attrs.tag), props: (node.attrs.props ?? {}) as ComponentProps }
    return !found
  })
  return found
}

/** Lower case, no accents, `ä` = `ae` = `a`: "ueberschrift" and "uberschrift" both find "Überschrift". */
function fold(text: string): string {
  return text.toLowerCase().replace(/ß/g, 'ss').normalize('NFD').replace(/\p{M}/gu, '').replace(/(a|o|u)e/g, '$1')
}

/**
 * The items whose label, keywords or description contain every word of `query`, in the order the menus show them: by
 * group, the group of the best match first, label matches first inside a group. So the first item is the best match,
 * and the arrow keys walk the list as it is drawn.
 */
export function filterSlashItems(items: readonly SlashItem[], query: string): SlashItem[] {
  const words = fold(query).split(/\s+/).filter(Boolean)
  if (!words.length) return byGroup(items)
  const scored: Array<{ item: SlashItem; rank: number; index: number }> = []
  items.forEach((item, index) => {
    const label = fold(item.label)
    const rest = fold([...item.keywords, item.describe].join(' '))
    if (!words.every((w) => label.includes(w) || rest.includes(w))) return
    scored.push({ item, rank: words.every((w) => label.startsWith(w) || label.includes(` ${w}`)) ? 0 : words.every((w) => label.includes(w)) ? 1 : 2, index })
  })
  return byGroup(scored.sort((a, b) => a.rank - b.rank || a.index - b.index).map((s) => s.item))
}

/** `items` with each group together, groups in the order they first appear. */
function byGroup(items: readonly SlashItem[]): SlashItem[] {
  const groups = [...new Set(items.map((item) => item.group))]
  return groups.flatMap((group) => items.filter((item) => item.group === group))
}
