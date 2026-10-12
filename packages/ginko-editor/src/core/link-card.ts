// A bare address pasted on an empty line can become a link card: a block component with an `href` and nothing else required.
import type { ComponentRegistry } from '@lupinum/ginko'
import type { Editor } from '@tiptap/core'
import { propFields, editorMeta } from './component-props.ts'

/** The tag of the component that shows a link as a card (the registry's own, e.g. `read-more`), or undefined when it has none. */
export function linkCardTag(registry: ComponentRegistry | undefined): string | undefined {
  if (!registry) return undefined
  const candidates = Object.entries(registry)
    .filter(([, def]) => def.kind === 'block' && !def.parents?.length && !editorMeta(def).hidden)
    .map(([tag, def]) => ({ tag, fields: propFields(def) }))
    .filter(({ fields }) => fields.some(([key, field]) => key === 'href' && !field.optional) && fields.every(([key, field]) => key === 'href' || field.optional))
  // The simplest one: the fewest props.
  return candidates.sort((a, b) => a.fields.length - b.fields.length)[0]?.tag
}

/**
 * Replaces the paragraph at `pos` (which holds only the address) with the component `tag` carrying it as `href`.
 * Returns false when the paragraph is no longer there as it was.
 */
export function makeLinkCard(editor: Editor, pos: number, url: string, tag: string): boolean {
  const node = editor.state.doc.nodeAt(pos)
  if (!node || node.type.name !== 'paragraph' || node.textContent !== url) return false
  const type = editor.schema.nodes.component
  const paragraph = editor.schema.nodes.paragraph
  if (!type || !paragraph) return false
  const card = type.create({ tag, props: { href: url } }, paragraph.create())
  const tr = editor.state.tr.replaceWith(pos, pos + node.nodeSize, card)
  editor.view.dispatch(tr)
  editor.commands.focus(pos + 2)
  return true
}
