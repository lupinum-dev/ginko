// Which blocks of a rich text (Markdown) were removed or added (UI.md 10.5), as parsed trees: the history and the
// review show them formatted, a heading as a heading and a bullet as a bullet, not as Markdown codes. The parser is
// core's (comark), which the Studio already has for the editor; nothing is fetched.
import type { Json } from '@lupinum/ginko'
import { fileRefOf, parseMarkdown, stableJson, type MarkdownTree } from '@lupinum/ginko/internal'
import { sequenceDiff } from './paragraphDiff'

export interface BlockChange { kind: 'removed' | 'added'; tree: MarkdownTree }

const HEADING = /^h[1-6]$/

/** A node without heading anchors: they follow the other headings of the text, so they say nothing about this one. */
function withoutAnchors(node: Json): Json {
  if (!Array.isArray(node)) return node
  const [tag, props, ...children] = node
  const own = typeof tag === 'string' && HEADING.test(tag) && props && typeof props === 'object' && !Array.isArray(props)
    ? Object.fromEntries(Object.entries(props).filter(([name]) => name !== 'id'))
    : props
  return [tag ?? null, own ?? {}, ...children.map(withoutAnchors)]
}

/** The blocks of a text: its top-level nodes, and each item of a list on its own, inside its list tag, so it stays a bullet. */
async function blocksOf(text: string): Promise<Json[]> {
  if (!text.trim()) return []
  const { value } = await parseMarkdown(text)
  return value.nodes.flatMap((node): Json[] => {
    if (typeof node === 'string') return node.trim() ? [node] : []
    const block = withoutAnchors(node)
    if (!Array.isArray(block) || (block[0] !== 'ul' && block[0] !== 'ol')) return [block]
    const [tag, props, ...items] = block
    return items.filter((item) => Array.isArray(item)).map((item): Json => [tag ?? null, props ?? {}, item])
  })
}

/** Removed and added blocks in reading order. An ordered list's item shows as "1." on its own. */
export async function markdownDiff(before: string, after: string): Promise<BlockChange[]> {
  const [a, b] = await Promise.all([blocksOf(before), blocksOf(after)])
  return sequenceDiff(a, b, stableJson).map(({ kind, item }) => ({ kind, tree: { nodes: [item] } }))
}

/** The library files the blocks show as pictures (`![…]($file.<id>)`), for one URL query. */
export function pictureIdsOf(blocks: readonly BlockChange[]): string[] {
  const ids = new Set<string>()
  const walk = (node: Json) => {
    if (!Array.isArray(node)) return
    const [tag, props, ...children] = node
    const id = tag === 'img' && props && typeof props === 'object' && !Array.isArray(props) && typeof props.src === 'string' ? fileRefOf(props.src) : undefined
    if (id) ids.add(id)
    children.forEach(walk)
  }
  for (const block of blocks) block.tree.nodes.forEach(walk)
  return [...ids]
}
