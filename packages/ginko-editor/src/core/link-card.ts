// Plain content that can become one of the site's blocks: a bare address pasted on an empty line becomes a link card (a
// block component with an `href` and nothing else required), a picture becomes a figure (to give it a caption).
import type { ComponentRegistry } from '@lupinum/ginko/internal'
import type { Editor } from '@tiptap/core'
import { propFields, editorMeta, type ComponentProps } from './component-props.ts'

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

/**
 * The tag of the block that shows a picture with a caption (the registry's own, e.g. `figure`): a required image `src`
 * and an optional text `caption`. Undefined when the site has none.
 */
export function figureTag(registry: ComponentRegistry | undefined): string | undefined {
  if (!registry) return undefined
  const candidates = Object.entries(registry)
    .filter(([, def]) => def.kind === 'block' && !def.parents?.length && !editorMeta(def).hidden)
    .map(([tag, def]) => ({ tag, fields: propFields(def) }))
    .filter(({ fields }) => fields.some(([key, field]) => key === 'src' && field.type === 'image' && !field.optional)
      && fields.some(([key, field]) => key === 'caption' && field.type === 'text' && field.optional))
  // The simplest one: the fewest props.
  return candidates.sort((a, b) => a.fields.length - b.fields.length)[0]?.tag
}

/**
 * Turns the picture at `pos` into the block `tag` (see figureTag), with its address and, when the block has an `alt`,
 * `alt`. A picture alone in its paragraph takes the paragraph's place; one in a line splits the line there.
 * Returns the position of the new block, or undefined when there is no picture at `pos`.
 */
export function makeFigure(editor: Editor, pos: number, tag: string, registry: ComponentRegistry, alt: string): number | undefined {
  const { state } = editor
  const image = state.doc.nodeAt(pos)
  const type = editor.schema.nodes.component
  if (!image || image.type.name !== 'image' || !type) return undefined
  const props: ComponentProps = { src: String(image.attrs.src ?? '') }
  const altField = registry[tag]?.props.alt
  if (altField?.type === 'text' && alt.trim()) props.alt = alt.trim()
  const figure = type.create({ tag, props })
  // The picture and the spaces around it go: the block splits the line there.
  const $pos = state.doc.resolve(pos)
  const before = $pos.nodeBefore
  const after = state.doc.resolve(pos + 1).nodeAfter
  const from = pos - (before?.isText ? before.text!.length - before.text!.trimEnd().length : 0)
  const to = pos + 1 + (after?.isText ? after.text!.length - after.text!.trimStart().length : 0)
  const first = from === $pos.start()
  const last = to === $pos.end()
  const tr = state.tr
  let at: number
  if (first && last) {
    at = $pos.before()
    tr.replaceWith(at, $pos.after(), figure)
  } else if (first) {
    at = $pos.before()
    tr.delete(from, to).insert(at, figure)
  } else if (last) {
    tr.delete(from, to)
    at = tr.mapping.map($pos.after())
    tr.insert(at, figure)
  } else {
    tr.delete(from, to).split(from)
    at = from + 1
    tr.insert(at, figure)
  }
  editor.view.dispatch(tr)
  return at
}
