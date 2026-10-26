import type { Bundle } from './bundle.ts'
import type { Locale } from './types.ts'
import { trimPath } from './path.ts'

export interface NavNode {
  title: string
  path: string
  id?: string
  brick?: string
  children: NavNode[]
}


/** Path prefixes of `/a/b/c`, longest first, without the path itself: `/a/b`, `/a`, `/`. */
function ancestorsOf(path: string): string[] {
  const parts = path.split('/').filter(Boolean)
  const out: string[] = []
  for (let n = parts.length - 1; n >= 0; n--) out.push('/' + parts.slice(0, n).join('/'))
  return out
}

/**
 * Navigation tree of the collections `bricks` in `locale`, built from item URLs. An item is a child of the
 * node at its nearest existing path prefix, else a root node. A string `parent` field (item id) overrides that.
 * Siblings keep the item order of the bundle (bricks in the given order).
 */
export function navTree(bundle: Bundle, bricks: string[], locale: Locale): NavNode[] {
  const entries: { node: NavNode; parent?: string }[] = []
  for (const brick of bricks) {
    const b = Object.hasOwn(bundle.bricks, brick) ? bundle.bricks[brick] : undefined
    if (b?.kind !== 'collection') continue
    for (const item of b.items) {
      const url = item.urls?.[locale]
      if (url === undefined) continue
      const path = trimPath(url)
      const title = typeof item.data.title === 'string' && item.data.title ? item.data.title : (path.split('/').filter(Boolean).pop() ?? path)
      entries.push({ node: { title, path, id: item.id, brick, children: [] }, parent: typeof item.data.parent === 'string' ? item.data.parent : undefined })
    }
  }
  const byPath = new Map<string, NavNode>()
  const byId = new Map<string, NavNode>()
  for (const { node } of entries) {
    if (!byPath.has(node.path)) byPath.set(node.path, node)
    if (node.id !== undefined && !byId.has(node.id)) byId.set(node.id, node)
  }
  const parentId = new Map(entries.map((e) => [e.node, e.parent]))
  const fallback = (node: NavNode) => {
    const hit = ancestorsOf(node.path).find((p) => byPath.has(p) && byPath.get(p) !== node)
    return hit !== undefined ? byPath.get(hit) : undefined
  }
  return nestBy(entries.map((e) => e.node), (n) => {
    const id = parentId.get(n)
    return id !== undefined ? byId.get(id) : undefined
  }, (n) => n.children, fallback)
}

/**
 * Nests `items` in their order: each goes into the children of `parentOf(item)`, or of `fallback(item)` when that
 * would make a cycle or there is none, else it is a root. A target that would make a cycle is never used.
 */
export function nestBy<T>(items: readonly T[], parentOf: (item: T) => T | undefined, childrenOf: (item: T) => T[], fallback?: (item: T) => T | undefined): T[] {
  const up = new Map<T, T>()
  const isAncestor = (maybe: T, of: T): boolean => {
    for (let n: T | undefined = of; n !== undefined; n = up.get(n)) if (n === maybe) return true
    return false
  }
  const roots: T[] = []
  for (const item of items) {
    let target = parentOf(item)
    if (target !== undefined && isAncestor(item, target)) target = undefined
    if (target === undefined) target = fallback?.(item)
    if (target !== undefined && isAncestor(item, target)) target = undefined
    if (target !== undefined) { childrenOf(target).push(item); up.set(item, target) } else roots.push(item)
  }
  return roots
}

/** Nodes from the root down to the node at `path`; empty when the path is not in the tree. */
export function breadcrumbs(tree: NavNode[], path: string): NavNode[] {
  const want = trimPath(path)
  const walk = (nodes: NavNode[], trail: NavNode[]): NavNode[] | undefined => {
    for (const node of nodes) {
      const here = [...trail, node]
      if (node.path === want) return here
      const found = walk(node.children, here)
      if (found) return found
    }
    return undefined
  }
  return walk(tree, []) ?? []
}
