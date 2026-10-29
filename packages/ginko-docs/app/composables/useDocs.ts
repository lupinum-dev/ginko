// What is docs-specific on top of Ginko's navigation: the tree comes from `useGinkoNav`, the
// breadcrumb chain from `useGinkoBreadcrumbs`; this adds tabs and sections from the entries' fields.
import schema from '#ginko/schema'
import { navTabs } from '@lupinum/ginko/internal'
import { enrichNav, type DocNode, type DocTab } from '../lib/docsNav'

export function useDocs() {
  const brick = useDocsBrick()
  const items = useGinko(brick)
  const tree = useGinkoNav([brick])
  const chain = useGinkoBreadcrumbs([brick])

  // Ginko's nodes carry title and path; badge, icon, section and tab live on the entry (rules: enrichNav).
  const byId = computed(() => new Map(items.value.items.map((d) => [d.id, d.data])))
  const nodes = computed<DocNode[]>(() => enrichNav(tree.value, (id) => byId.value.get(id)))

  const tabs = computed<DocTab[]>(() => {
    const out = new Map<string, DocTab>()
    for (const n of nodes.value) if (n.tab && !out.has(n.tab)) out.set(n.tab, { title: n.tab, path: n.path })
    return out.size > 1 ? [...out.values()] : []
  })
  const activeTab = computed(() => (tabs.value.length ? nodes.value.find((n) => n.path === chain.value[0]?.path)?.tab ?? tabs.value[0]!.title : undefined))

  // Roots of the active tab, grouped by `section` (a section is a run of neighbours with the same one; rule: navTabs).
  const sections = computed(() => {
    const all = navTabs(nodes.value)
    return (all.find((t) => t.title === activeTab.value) ?? all[0]!).sections
  })

  // Tab (when tabs are shown), then the parent chain down to this page.
  const crumbs = computed<{ title: string; path: string }[]>(() => {
    const tab = tabs.value.find((t) => t.title === activeTab.value)
    const short = (id: string | undefined) => (id ? byId.value.get(id)?.navTitle : undefined)
    return [...(tab ? [tab] : []), ...chain.value.map(({ id, title, path }) => ({ title: short(id) || title, path }))]
  })

  /** The first page of the docs in this language: where `/docs` (and `/` without a start page) lead. */
  const first = computed(() => nodes.value[0]?.path)

  /** Where the docs live in this language (docsCollection's `base`, `/docs` by default), e.g. `/de/docs`. */
  const { localePath } = useI18n()
  const { mainLocale } = useGinkoSite()
  const route = ((schema.bricks as Record<string, unknown>)[brick] as { route?: Record<string, string> } | undefined)?.route?.[mainLocale]
  const mainBase = route?.replace(/\/\[slug\]$/, '') ?? '/docs'
  const base = computed(() => localePath(mainBase))

  return { nodes, tabs, activeTab, sections, crumbs, first, base, mainBase }
}
