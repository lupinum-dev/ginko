// Opens a Ginko Markdown field in a headless TipTap editor and saves it back without touching untouched text.
import type { ComponentRegistry, Described, Json, MarkdownBlocks, MarkdownProfile } from '@lupinum/ginko'
import { isStableMarkdown, markdownBlocks, msg, parseMarkdown, serializeMarkdown } from '@lupinum/ginko'
import { Editor, getSchema, type AnyExtension } from '@tiptap/core'
import { Node as PmNode } from '@tiptap/pm/model'
import { fromEditorDoc, toEditorDoc, type GinkoDoc, type GinkoDocNode } from './convert.ts'
import { ginkoExtensions, type GinkoExtensionsOptions } from './extensions.ts'

export interface GinkoEditorOptions {
  /** The Markdown text of the field (a body, no frontmatter). */
  text: string
  profile: MarkdownProfile
  components?: ComponentRegistry
  /** Where TipTap mounts. Without it the editor works on a detached element (tests, no UI yet). */
  element?: HTMLElement
  /**
   * Lets the UI add to or replace extensions (node views, key bindings, the slash menu). It must not change
   * the schema: nodes and marks come from `ginkoExtensions`, an extension may only extend those.
   */
  extend?: (extensions: AnyExtension[]) => AnyExtension[]
  /** Pictures that were pasted or dropped (files, and the position they belong at). Return true when the UI takes them. */
  onImageFiles?: GinkoExtensionsOptions['onImageFiles']
  /** A bare address was pasted on an empty line and became a link: the UI may offer to turn it into a link card. */
  onUrlPasted?: GinkoExtensionsOptions['onUrlPasted']
  /** Open as Markdown source although the text could be shown rich (the person chose the source view). */
  forceSource?: boolean
}

interface Base {
  profile: MarkdownProfile
  /** Why the text is not opened as a rich document (source mode), or what the profile does not allow. Empty in rich mode. */
  problems: string[]
  /** The same problems with catalog key and parameters, in the same order: the UI translates them with `coreMessage(locale, key, params)`. */
  problemMessages: Described[]
  /** True once the content really differs from what was opened. Typing and undoing back to the start is not dirty. */
  readonly dirty: boolean
  /** The Markdown for the field. Untouched top-level blocks are the original text, byte for byte. */
  markdown(): Promise<string>
  /** Calls `listener` after every change of the content (and of `dirty`). Returns the function that stops it. */
  onChange(listener: () => void): () => void
  destroy(): void
}

/** The text opened as a TipTap document. */
export interface GinkoRichEditor extends Base {
  mode: 'rich'
  editor: Editor
}

/** The text cannot be edited as a rich document without changing it: the UI shows a textarea bound to `source`. */
export interface GinkoSourceEditor extends Base {
  mode: 'source'
  editor?: undefined
  /** The current text. Set it from the textarea. */
  source: string
}

export type GinkoEditorHandle = GinkoRichEditor | GinkoSourceEditor

const sameJson = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

/**
 * Opens `text`. Rich mode needs three things: the text has no problems for the profile, it survives comark's
 * renderer (`isStableMarkdown`), and it survives the trip into the editor document and back unchanged. If one
 * of them fails, the result is in `source` mode: no document, the text is kept as it is.
 */
export async function createGinkoEditor(options: GinkoEditorOptions): Promise<GinkoEditorHandle> {
  const { text, profile, components, element, extend, onImageFiles, onUrlPasted, forceSource } = options
  const parseOptions = { profile, components }
  const parsed = await parseMarkdown(text, parseOptions)
  const listeners = new Set<() => void>()
  const onChange = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } }
  const notify = () => listeners.forEach((l) => l())

  const toSource = (problemMessages: Described[]): GinkoSourceEditor => {
    let source = text
    return {
      mode: 'source', profile, problems: problemMessages.map((p) => p.message), problemMessages,
      get source() { return source },
      set source(value: string) { source = value; notify() },
      get dirty() { return source !== text },
      markdown: async () => source,
      onChange,
      destroy: () => listeners.clear(),
    }
  }

  if (forceSource || parsed.problems.length) return toSource(parsed.problemMessages)
  if (!(await isStableMarkdown(text, parseOptions))) return toSource([msg('editor.source.unstable')])

  const original: MarkdownBlocks = await markdownBlocks(text, parseOptions)
  const nodes = original.nodes
  const sources = new Map<Json, string>()
  for (const block of original.blocks) if (block.nodes.length === 1) sources.set(block.nodes[0]!, block.source)
  const extensions = (extend ?? ((list) => list))(ginkoExtensions({ profile, components, onImageFiles, onUrlPasted }))

  // The document must fit the schema and come back as the same tree; otherwise saving would change the text.
  let doc: GinkoDoc
  try {
    doc = toEditorDoc(nodes, { components, sourceOf: (node) => sources.get(node) })
    // An empty field is one empty paragraph in the editor (a document needs a block); markdown() maps it back to the empty text.
    if (nodes.length === 0) doc = { type: 'doc', content: [{ type: 'paragraph' }] }
    const checked = PmNode.fromJSON(getSchema(extensions), doc)
    checked.check()
    if (nodes.length > 0 && !sameJson(fromEditorDoc(checked.toJSON()), nodes)) return toSource([msg('editor.source.lossy')])
  } catch (error) {
    return toSource([msg('editor.source.failed', { reason: error instanceof Error ? error.message : String(error) })])
  }

  // The document ends with an empty paragraph after a last list, table or component, so the cursor can go below it.
  // It is not part of the text: markdown() leaves it out. It is already in the initial document, so `dirty` stays false.
  if (profile !== 'inline' && doc.content?.at(-1)?.type !== 'paragraph') doc = { ...doc, content: [...(doc.content ?? []), { type: 'paragraph' }] }
  const editor = new Editor({ element, extensions, content: doc, editable: true })
  const initial = editor.state.doc
  editor.on('update', notify)
  return {
    mode: 'rich', profile, problems: [], problemMessages: [], editor,
    get dirty() { return !editor.state.doc.eq(initial) },
    async markdown() {
      const current = editor.state.doc
      // An empty document is one empty paragraph; the text of an empty field stays as it was.
      if (nodes.length === 0 && current.childCount === 1 && current.firstChild!.content.size === 0) return text
      const json = current.toJSON() as GinkoDocNode
      // Empty paragraphs at the end are the typing room below the last block, not text.
      const content = [...(json.content ?? [])]
      while (content.length > 1 && content.at(-1)!.type === 'paragraph' && !content.at(-1)!.content?.length) content.pop()
      return serializeMarkdown(fromEditorDoc({ ...json, content }), { original })
    },
    onChange,
    destroy() { listeners.clear(); editor.destroy() },
  }
}
