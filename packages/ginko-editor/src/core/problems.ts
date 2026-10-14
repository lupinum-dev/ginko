// Problems of a Markdown text, tied to the block they are in. The block is the top-level block of the text, counted
// from 0 (the same cut as `markdownBlocks`), so the editor can draw the message at the block and "Beheben" can go there.
//
// Two sources: `sourceProblems` reads a text (the profile check of the core, per block: what the source view shows);
// `docProblems` reads the open rich document (a component with a missing or invalid prop, a picture without description).
import type { ComponentRegistry, Described, MarkdownProfile } from '@lupinum/ginko/internal'
import { markdownBlocks, msg, parseMarkdown } from '@lupinum/ginko/internal'
import type { Node as PmNode } from '@tiptap/pm/model'
import { propFields, propProblemMessage, readProp, type ComponentProps } from './component-props.ts'

/** `message` is German (agents, logs); `key` + `params` are what the UI translates with `coreMessage(locale, key, params)`. */
export interface BlockProblem extends Described {
  /** Index of the top-level block. */
  index: number
}

export interface SourceProblem extends BlockProblem {
  /** Character offset in the text where the block starts, and its 1-based line. */
  from: number
  line: number
  /** The first line of the block, cut short, so the message can say where it is. */
  excerpt: string
}

export interface DocProblem extends BlockProblem {
  /** Position of the node the problem belongs to (a component or an image), in the ProseMirror document. */
  pos: number
  kind: 'component' | 'image'
  tag?: string
}

/** The problems of `text` for the profile, per block. Empty when the text has none. */
export async function sourceProblems(text: string, options: { profile: MarkdownProfile; components?: ComponentRegistry }): Promise<SourceProblem[]> {
  const { profile, components } = options
  const whole = await parseMarkdown(text, { profile, components })
  if (!whole.problems.length) return []
  const { blocks } = await markdownBlocks(text, { profile, components })
  const found: SourceProblem[] = []
  let cursor = 0
  for (const [index, block] of blocks.entries()) {
    const at = text.indexOf(block.source, cursor)
    const from = at < 0 ? cursor : at
    cursor = from + block.source.length
    const { problemMessages } = await parseMarkdown(block.source, { profile, components })
    const line = text.slice(0, from).split('\n').length
    const excerpt = block.source.split('\n')[0]!.slice(0, 60)
    // A problem with its own line (an unclosed component) counts it from the block's first line.
    for (const problem of problemMessages) found.push({ ...problem, index, from, line: problem.line === undefined ? line : line + problem.line - 1, excerpt })
  }
  // A problem that only shows when the whole text is read (it cannot be tied to one block) goes to the first block.
  for (const problem of whole.problemMessages) {
    if (!found.some((p) => p.message === problem.message)) found.push({ ...problem, index: 0, from: 0, line: problem.line ?? 1, excerpt: text.split('\n')[0]!.slice(0, 60) })
  }
  return found.sort((a, b) => a.index - b.index)
}

/** One message for the component at `node`: its first problem, and how many more there are. */
function componentMessage(registry: ComponentRegistry, tag: string, props: ComponentProps): Described | undefined {
  const def = Object.hasOwn(registry, tag) ? registry[tag] : undefined
  if (!def) return msg('editor.component.unknown', { tag })
  const problems = propFields(def)
    .map(([key, field]) => propProblemMessage(registry, tag, key, readProp(field, props, key)))
    .filter((m): m is Described => m !== undefined)
  const [first, ...rest] = problems
  if (!first) return undefined
  if (!rest.length) return first
  return msg('editor.component.more', { first: { key: first.key, ...(first.params ? { params: first.params } : {}) }, count: rest.length })
}

/**
 * The problems of the open document: components with invalid props, pictures without a description. `described` says
 * whether a picture without its own text still has one (a Files library file with a description in the text's
 * language), the same rule as the save (effective alt).
 */
export function docProblems(doc: PmNode, registry: ComponentRegistry | undefined, described?: (src: string) => boolean): DocProblem[] {
  const found: DocProblem[] = []
  doc.forEach((top, offset, index) => {
    top.descendants((node, pos) => {
      const at = offset + pos
      if (node.type.name === 'component' && registry) {
        const tag = String(node.attrs.tag)
        const problem = componentMessage(registry, tag, (node.attrs.props ?? {}) as ComponentProps)
        if (problem) found.push({ ...problem, index, pos: at, kind: 'component', tag })
      } else if (node.type.name === 'image' && !String(node.attrs.alt ?? '').trim() && !described?.(String(node.attrs.src ?? ''))) {
        found.push({ ...msg('editor.problem.imageNoDescription'), index, pos: at, kind: 'image' })
      }
      return true
    })
    // The top-level node itself is not visited by descendants().
    if (top.type.name === 'component' && registry) {
      const tag = String(top.attrs.tag)
      const problem = componentMessage(registry, tag, (top.attrs.props ?? {}) as ComponentProps)
      if (problem) found.push({ ...problem, index, pos: offset, kind: 'component', tag })
    }
  })
  return found
}
