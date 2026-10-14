// Tabs and sections of the side navigation, from the entries' fields. Pure, so the rules have a test.
import type { NavNode } from '@lupinum/ginko'

export interface DocNode extends NavNode {
  section?: string
  badge?: string
  icon?: string
  tab?: string
  children: DocNode[]
}
export interface DocTab { title: string; path: string }

export interface DocFields { tab?: string; section?: string; badge?: string; icon?: string }

/**
 * A root without a tab follows the one before it; a new tab starts without a section; a section runs until the
 * next one. Children always follow their parent's tab and carry no section.
 */
export function enrichNav(tree: NavNode[], fieldsOf: (id: string) => DocFields | undefined): DocNode[] {
  let running: string | undefined
  let section: string | undefined
  const enrich = (node: NavNode, tab: string | undefined, root: boolean): DocNode => {
    const data = fieldsOf(node.id ?? '')
    if (root) {
      if (data?.tab && data.tab !== running) section = undefined
      running = data?.tab ?? running
      section = data?.section ?? section
    }
    const own = root ? running : tab
    return {
      ...node, tab: own, section: root ? section : undefined, badge: data?.badge, icon: data?.icon,
      children: node.children.map((c) => enrich(c, own, false)),
    }
  }
  return tree.map((n) => enrich(n, undefined, true))
}
