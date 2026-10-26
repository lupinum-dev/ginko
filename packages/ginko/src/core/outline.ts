// The side navigation of a manually ordered collection with `parent`, `section` and `tab` fields (the docs layer), and
// the plan for moving one page in it. One set of rules for the website (docs layer), the Studio's tree and the server's
// move, so all three show and write the same structure.
import { nestBy } from './navigation.ts'
import type { Brick, CollectionBrick } from './types.ts'

/** A collection with a navigation tree: manual order and a single `parent` ref to itself (the docs layer's fields). */
export function isNavTree(key: string, brick: Brick): brick is CollectionBrick {
  const parent = brick.kind === 'collection' ? brick.fields.parent : undefined
  return brick.kind === 'collection' && brick.order === 'manual' && parent?.type === 'ref' && parent.to === key && !parent.multiple
}

/** What decides a root's group: its own `tab` and `section` texts (in the language shown). */
export interface GroupFields { tab?: string; section?: string }
/** The tab and section a root resolves to. */
export interface Grouped { tab?: string; section?: string }

/**
 * The tab and section of each root, in order: a root without a tab follows the one before it; a new tab starts without
 * a section; a section runs until the next one. (Children always follow their parent and carry no section.)
 */
export function navGroups<T>(roots: readonly T[], fieldsOf: (root: T, index: number) => GroupFields | undefined): Grouped[] {
  let tab: string | undefined
  let section: string | undefined
  return roots.map((root, index) => {
    const own = fieldsOf(root, index)
    if (own?.tab && own.tab !== tab) section = undefined
    tab = own?.tab ?? tab
    section = own?.section ?? section
    return { tab, section }
  })
}

export interface NavSection<T> { title?: string; nodes: T[] }
export interface NavTab<T> { title?: string; sections: NavSection<T>[] }

/**
 * How the website groups resolved roots: tabs by name in order of first use (shown only when there are two or more;
 * roots before the first tab belong to the first), and in each tab the runs of neighbours with the same section.
 * One tab without a title when the site shows no tabs.
 */
export function navTabs<T extends Grouped>(roots: readonly T[]): NavTab<T>[] {
  const names = [...new Set(roots.map((r) => r.tab).filter((t): t is string => !!t))]
  const runs = (nodes: readonly T[]) => {
    const out: NavSection<T>[] = []
    for (const node of nodes) {
      const last = out.at(-1)
      if (last && last.title === node.section) last.nodes.push(node)
      else out.push({ title: node.section, nodes: [node] })
    }
    return out
  }
  if (names.length < 2) return [{ title: undefined, sections: runs(roots) }]
  return names.map((name) => ({ title: name, sections: runs(roots.filter((r) => (r.tab ?? names[0]) === name)) }))
}

/**
 * One page of the collection, in stored order: its id, its `parent` (an id) and its own section and tab texts. `draft`:
 * not on the website. Its own section or tab counts only where it repeats the next live page's (a draft put first in
 * a section, which leads it once published); otherwise it follows the running ones.
 */
export interface OutlineRow extends GroupFields { id: string; parent?: string; draft?: boolean }
export interface OutlineNode<R extends OutlineRow = OutlineRow> extends Grouped { row: R; children: OutlineNode<R>[] }

/**
 * The tree the website builds from these rows: `parent` nests (wherever the child is stored; a parent missing from the
 * rows or a cycle leaves the page a root), siblings keep the stored order, roots get their tab and section.
 */
export function outline<R extends OutlineRow>(rows: readonly R[]): OutlineNode<R>[] {
  const nodes = rows.map((row): OutlineNode<R> => ({ row, children: [] }))
  const byId = new Map(nodes.map((n) => [n.row.id, n]))
  const roots = nestBy(nodes, (n) => (n.row.parent !== undefined ? byId.get(n.row.parent) : undefined), (n) => n.children)
  navGroups(roots, (n, i) => (n.row.draft ? draftFields(n.row, roots.slice(i + 1).find((r) => !r.row.draft)?.row) : n.row)).forEach((g, i) => Object.assign(roots[i]!, g))
  return roots
}

/** The own fields of a draft root that count: those the next live root repeats. */
function draftFields(draft: OutlineRow, next: OutlineRow | undefined): GroupFields | undefined {
  const tab = draft.tab && draft.tab === next?.tab ? draft.tab : undefined
  const section = draft.section && draft.section === next?.section ? draft.section : undefined
  return tab || section ? { ...(tab ? { tab } : {}), ...(section ? { section } : {}) } : undefined
}

/** Every node of the tree, parents before their children, siblings in order. */
export function walkOutline<R extends OutlineRow>(roots: readonly OutlineNode<R>[]): OutlineNode<R>[] {
  const out: OutlineNode<R>[] = []
  const walk = (n: OutlineNode<R>) => { out.push(n); n.children.forEach(walk) }
  roots.forEach(walk)
  return out
}

/**
 * Where a page goes: as the first child of `parent`, after its sibling `after` (inside `parent`, or among the roots
 * without `parent`), or as the root just before the root `before` (in that root's tab and section: the first page of a
 * section or tab).
 */
export type Place = { parent: string; after?: string } | { after: string } | { before: string }

/** A field write of the plan: copy the stored value of the page `from` (`section`, `tab`), set an id (`parent`), or remove it (null). */
export interface PlacePatch { parent?: string | null; section?: { from: string } | null; tab?: { from: string } | null }
export interface PlacePlan {
  /** All ids in their new stored order. */
  order: string[]
  /** Field writes by page id; only fields that change. Empty (and `order` unchanged) when the page is already there. */
  patch: Record<string, PlacePatch>
}
export type PlaceRefusal = 'missing' | 'cycle' | 'invalid'

/**
 * The writes that put page `id` (with its subpages) at `place`. Every other page keeps the tab, section, parent and
 * relative order it has on the website: a section or tab the page started passes to the page that follows, and the
 * page takes the tab and section of its new place (from the page it is placed before, it takes over the heading).
 */
export function placePlan(rows: readonly OutlineRow[], id: string, place: Place): PlacePlan | PlaceRefusal {
  const tree = outline(rows)
  const all = walkOutline(tree)
  const node = new Map(all.map((n) => [n.row.id, n]))
  const parentOf = new Map<string, string>()
  for (const n of all) for (const c of n.children) parentOf.set(c.row.id, n.row.id)
  const me = node.get(id)
  if (!me) return 'missing'
  const block = walkOutline([me]).map((n) => n.row.id)
  const inBlock = new Set(block)
  const parent = 'parent' in place ? place.parent : undefined
  const anchor = 'after' in place ? place.after : 'before' in place ? place.before : undefined
  if (parent !== undefined && !node.has(parent)) return 'missing'
  if (anchor !== undefined && !node.has(anchor)) return 'missing'
  if (parent !== undefined && inBlock.has(parent)) return 'cycle'
  if (anchor !== undefined && inBlock.has(anchor)) return 'invalid'
  // The anchor must be a sibling at the place: a child of `parent`, or a root.
  if (anchor !== undefined && parentOf.get(anchor) !== parent) return 'invalid'

  // The new stored order: the block, in its stored order, between the siblings it goes between (siblings follow the
  // stored order; their subpages can be stored anywhere): after the anchor and its subpages unless the next sibling
  // comes first, before `before`, or first among the parent's children.
  const base = rows.map((r) => r.id).filter((x) => !inBlock.has(x))
  const siblings = (parent === undefined ? tree : node.get(parent)!.children).map((n) => n.row.id).filter((x) => !inBlock.has(x))
  const endOf = (sib: string) => Math.max(...walkOutline([node.get(sib)!]).map((n) => base.indexOf(n.row.id))) + 1
  const next = (sib: string) => siblings[siblings.indexOf(sib) + 1]
  let at: number
  if ('before' in place) at = base.indexOf(place.before)
  else if (place.after !== undefined) {
    const after = next(place.after)
    at = after === undefined ? endOf(place.after) : Math.min(endOf(place.after), base.indexOf(after))
  } else at = Math.min(base.indexOf(parent!) + 1, ...siblings.map((x) => base.indexOf(x)))
  const storedBlock = rows.map((r) => r.id).filter((x) => inBlock.has(x))
  const order = [...base.slice(0, at), ...storedBlock, ...base.slice(at)]
  const oldParent = parentOf.get(id)
  // What every root shows on the website today (live pages only: a live page under a draft is a root there), and what
  // the moved page should show at its new place.
  const live = (xs: readonly OutlineRow[]) => xs.filter((r) => !r.draft)
  const want = new Map<string, Grouped>(outline(live(rows)).map((r) => [r.row.id, { tab: r.tab, section: r.section }]))
  // The block brings no headings: a page of it that the website shows as a root (under a draft) takes the running ones.
  for (const x of block) want.delete(x)
  // Before a root: its groups, as the Studio shows them (a draft leading a section has its heading). After a live root:
  // its groups; after a draft: the running ones there (a draft's groups follow its neighbours, the moved page included).
  const before = 'before' in place ? node.get(place.before)! : undefined
  const placeGoal = before ? { tab: before.tab, section: before.section } : parent === undefined ? want.get(anchor!) : undefined
  if (placeGoal) want.set(id, placeGoal)
  // Already there. (Just before the first page of the next section is another place: the first in that section.)
  const sameGroup = !placeGoal || (me.tab === placeGoal.tab && me.section === placeGoal.section)
  if (oldParent === parent && sameGroup && order.every((x, i) => x === rows[i]!.id)) return { order, patch: {} }
  // The stored page that holds a text, to copy its value (in every language).
  const source = (key: 'tab' | 'section', text: string) => rows.find((r) => r[key] === text)!.id

  const patch: Record<string, PlacePatch> = {}
  const write = (page: string, p: PlacePatch) => { patch[page] = { ...patch[page], ...p } }
  const byId = new Map(rows.map((r) => [r.id, { ...r }]))
  const moved = byId.get(id)!
  if (oldParent !== parent) write(id, { parent: parent ?? null })
  moved.parent = parent
  // The page brings no group of its own: it takes the one of its place below. Nor do its subpages (the website ignores a
  // subpage's own section and tab, except while its parent is a draft, when it shows as a root).
  for (const x of block) {
    const page = byId.get(x)!
    if (page.section) write(x, { section: null })
    if (page.tab) write(x, { tab: null })
    delete page.section
    delete page.tab
  }

  // Walk the website's new roots and write the least that keeps each root where it should be. Drafts are not on the
  // website: they never hold a heading after a move (the website would lose it until they are published).
  const newRows = order.map((x) => byId.get(x)!)
  const roots = outline(live(newRows))
  const tidy = new Set([id, 'before' in place ? place.before : ''])
  let tab: string | undefined
  let section: string | undefined
  for (const root of roots) {
    const r = root.row
    // A page of a stored cycle can turn into a root when the order changes; it keeps whatever it gets.
    const goal = want.get(r.id) ?? { tab, section }
    if ((r.tab && r.tab !== goal.tab) || (!r.tab && tab !== goal.tab && goal.tab)) {
      r.tab = goal.tab
      write(r.id, { tab: { from: source('tab', goal.tab!) } })
    } else if (r.tab && r.tab === tab && tidy.has(r.id)) {
      // Repeats the running tab: no longer needed.
      delete r.tab
      write(r.id, { tab: null })
    }
    if (r.tab && r.tab !== tab) section = undefined
    tab = r.tab || tab
    if ((r.section && r.section !== goal.section) || (!r.section && section !== goal.section && goal.section)) {
      r.section = goal.section
      write(r.id, { section: { from: source('section', goal.section!) } })
    } else if (r.section && r.section === section && tidy.has(r.id)) {
      delete r.section
      write(r.id, { section: null })
    }
    section = r.section || section
  }
  // A draft put first in a section gets a copy of its heading (the live page keeps its own): the Studio shows it there,
  // and once published it leads the section on the website too.
  if (moved.draft && 'before' in place) {
    const head = byId.get(place.before)!
    if (head.section) write(id, { section: { from: source('section', head.section) } })
    if (head.tab) write(id, { tab: { from: source('tab', head.tab) } })
  }
  // A write back to the stored value is no write.
  for (const [page, p] of Object.entries(patch)) {
    const stored = rows.find((r) => r.id === page)!
    for (const key of ['section', 'tab'] as const) {
      const w = p[key]
      if (w === null && !stored[key]) delete p[key]
      if (w && w.from === page && stored[key]) delete p[key]
    }
    if (p.parent !== undefined && (p.parent ?? undefined) === stored.parent) delete p.parent
    if (!Object.keys(p).length) delete patch[page]
  }
  return { order, patch }
}

/** The rows after `plan`: the new order, with `from` values copied from the stored rows. Shows a place before writing it. */
export function applyPlace(rows: readonly OutlineRow[], plan: PlacePlan): OutlineRow[] {
  const byId = new Map(rows.map((r) => [r.id, r]))
  return plan.order.map((id) => {
    const row: OutlineRow = { ...byId.get(id)! }
    const p = plan.patch[id] ?? {}
    if (p.parent !== undefined) { if (p.parent === null) delete row.parent; else row.parent = p.parent }
    for (const key of ['section', 'tab'] as const) {
      const w = p[key]
      if (w === null) delete row[key]
      else if (w) row[key] = byId.get(w.from)![key]
    }
    return row
  })
}
