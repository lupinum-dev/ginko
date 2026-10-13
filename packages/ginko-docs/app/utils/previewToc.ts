// The table of contents of a ```md preview: ginko-content keeps only the preview's nodes, so an `::inline-toc`
// inside a preview gets its links from here. Same shape as the page toc: h2 links with their h3 as children.
import type { MarkdownToc, TocLink } from '@lupinum/ginko'

type Node = string | [string, Record<string, unknown>, ...unknown[]]
const textOf = (node: Node): string => (typeof node === 'string' ? node : (node.slice(2) as Node[]).map(textOf).join(''))

export function previewToc(nodes: readonly unknown[]): MarkdownToc {
  const links: TocLink[] = []
  for (const node of nodes as Node[]) {
    if (typeof node === 'string' || (node[0] !== 'h2' && node[0] !== 'h3') || typeof node[1].id !== 'string') continue
    const link: TocLink = { id: node[1].id, depth: node[0] === 'h2' ? 2 : 3, text: textOf(node).trim() }
    const parent = links.at(-1)
    if (link.depth === 3 && parent?.depth === 2) (parent.children ??= []).push(link)
    else links.push(link)
  }
  return { links }
}
