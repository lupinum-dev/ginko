// Pure helpers of CodeTree: the path rules and the folder tree built from file paths.
export interface TreeNode { label: string; path: string; children?: TreeNode[] }

/** Why the paths cannot form a tree (a message for the console), or undefined. */
export function codeTreeProblem(paths: string[], defaultValue?: string): string | undefined {
  if (paths.length === 0) return 'No file with a file name.'
  const seen = new Set<string>()
  for (const path of paths) {
    if (!path.trim() || path.split('/').some((part) => !part.trim() || part === '.' || part === '..')) return `Invalid path “${path}”.`
    if (seen.has(path)) return `Path “${path}” appears twice.`
    seen.add(path)
  }
  for (const path of paths) {
    if (paths.some((other) => other.startsWith(`${path}/`))) return `“${path}” is a file and a folder at once.`
  }
  if (defaultValue !== undefined && !seen.has(defaultValue)) return `defaultValue “${defaultValue}” is not one of the files.`
}

/** Folders first, then files, each by name. */
export function buildTree(paths: string[]): TreeNode[] {
  const byPath = new Map<string, TreeNode>()
  const root: TreeNode[] = []
  for (const full of paths) {
    const parts = full.split('/')
    parts.forEach((label, i) => {
      const path = parts.slice(0, i + 1).join('/')
      if (byPath.has(path)) return
      const node: TreeNode = { label, path, ...(i < parts.length - 1 && { children: [] }) }
      byPath.set(path, node)
      if (i === 0) root.push(node)
      else byPath.get(parts.slice(0, i).join('/'))!.children!.push(node)
    })
  }
  const sort = (nodes: TreeNode[]): TreeNode[] => nodes
    .sort((a, b) => (!!a.children === !!b.children ? a.label.localeCompare(b.label) : a.children ? -1 : 1))
    .map((node) => (node.children ? { ...node, children: sort(node.children) } : node))
  return sort(root)
}

/** `a/b/c.ts` → `['a', 'a/b']`. */
export function ancestorsOf(path: string): string[] {
  const parts = path.split('/')
  return parts.slice(0, -1).map((_, i) => parts.slice(0, i + 1).join('/'))
}
