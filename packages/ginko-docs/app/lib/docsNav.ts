// Tabs and sections of the side navigation, from the entries' fields. Pure, so the rules have a test.
import type { NavNode } from '@lupinum/ginko'
import { navGroups } from '@lupinum/ginko/internal'

export interface DocNode extends NavNode {
  section?: string
  badge?: string
  icon?: string
  tab?: string
  children: DocNode[]
}
export interface DocTab { title: string; path: string }

export interface DocFields { tab?: string; section?: string; badge?: string; icon?: string; navTitle?: string }

/**
 * Tabs and sections by the core rule (`navGroups`: a root without a tab follows the one before it, a new tab starts
 * without a section, a section runs until the next one). Children always follow their parent's tab and carry no
 * section. A short title (`navTitle`) replaces the title.
 */
export function enrichNav(tree: NavNode[], fieldsOf: (id: string) => DocFields | undefined): DocNode[] {
  const groups = navGroups(tree, (node) => fieldsOf(node.id ?? ''))
  const enrich = (node: NavNode, tab: string | undefined, section: string | undefined): DocNode => {
    const data = fieldsOf(node.id ?? '')
    return {
      ...node, title: data?.navTitle || node.title, tab, section, badge: data?.badge, icon: data?.icon,
      children: node.children.map((c) => enrich(c, tab, undefined)),
    }
  }
  return tree.map((n, i) => enrich(n, groups[i]!.tab, groups[i]!.section))
}
