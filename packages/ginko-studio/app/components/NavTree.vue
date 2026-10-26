<!-- The navigation of a docs-like collection as the website shows it (core `outline`): tabs, sections, nesting. Owners
     and admins arrange it here: drag, Alt+arrows, the row menu or "Move to …"; a section or tab heading is renamed in
     place. Each move goes online at once, says where the page landed and offers Undo. -->
<script setup lang="ts">
import { ChevronDownIcon, ChevronRightIcon, EllipsisIcon, GripVerticalIcon, PencilIcon, PlusIcon, TriangleAlertIcon } from '@lucide/vue'
import { api } from '#convex/api'
import type { CollectionBrick } from '@lupinum/ginko'
import { navTabs, outline, walkOutline, type OutlineNode, type OutlineRow, type Place } from '@lupinum/ginko/internal'
import { opErrorOf } from '../composables/useOps'
import { Badge } from '@studio/components/ui/badge'
import { Button } from '@studio/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@studio/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuShortcut, DropdownMenuTrigger } from '@studio/components/ui/dropdown-menu'
import { Input } from '@studio/components/ui/input'

const props = defineProps<{
  slug: string
  brickKey: string
  brick: CollectionBrick
  /** Owners and admins: move pages and rename headings. */
  canArrange: boolean
  canCreate: boolean
  /** The content language of titles and headings (the site's main one). */
  language: string
}>()

const { t } = useI18n()
const ops = useOps(computed(() => props.slug))
const query = useConvexQuery(api.navigation.tree, () => ({ site: props.slug, brick: props.brickKey, language: props.language }))
type Page = NonNullable<typeof query.data.value>[number]
const pages = computed<Page[]>(() => query.data.value ?? [])
const byId = computed(() => new Map(pages.value.map((p) => [p._id as string, p])))
const rows = computed<OutlineRow[]>(() => pages.value.map((p) => ({
  id: p._id, ...(p.parent && byId.value.has(p.parent) ? { parent: p.parent } : {}),
  ...(p.section ? { section: p.section } : {}), ...(p.tab ? { tab: p.tab } : {}),
})))
const tree = computed(() => outline(rows.value))
const nodes = computed(() => new Map(walkOutline(tree.value).map((n) => [n.row.id, n])))
const parentOf = computed(() => {
  const out = new Map<string, string>()
  for (const n of nodes.value.values()) for (const c of n.children) out.set(c.row.id, n.row.id)
  return out
})
const tabs = computed(() => navTabs(tree.value))
const activeTab = ref<string | undefined>()
const shownTab = computed(() => tabs.value.find((x) => x.title === activeTab.value) ?? tabs.value[0]!)

const titleOf = (id: string) => { const p = byId.value.get(id); return p?.navTitle || p?.title || '' }
/** A heading's text in the language shown, from the page that holds it (the rules compare the main language). */
const labelOf = (key: 'section' | 'tab', text: string | undefined) => {
  if (!text) return ''
  const holder = pages.value.find((p) => p[key] === text)
  return (key === 'section' ? holder?.sectionLabel : holder?.tabLabel) || text
}
/** The page that starts a section run or tab: renaming it renames the heading. */
const sectionHolder = (roots: OutlineNode[], text: string | undefined) => (text ? roots.find((r) => r.row.section === text)?.row.id : undefined)
const tabHolder = (text: string | undefined) => (text ? tree.value.find((r) => r.row.tab === text)?.row.id : undefined)

const collapsed = ref(new Set<string>())
function toggle(id: string) {
  const next = new Set(collapsed.value)
  if (!next.delete(id)) next.add(id)
  collapsed.value = next
}
/** The rows on screen, in order, with their depth (for the row's indent and arrow-key focus). */
const visible = computed(() => {
  const out: { node: OutlineNode; depth: number }[] = []
  const walk = (n: OutlineNode, depth: number) => { out.push({ node: n, depth }); if (!collapsed.value.has(n.row.id)) n.children.forEach((c) => walk(c, depth + 1)) }
  for (const s of shownTab.value.sections) s.nodes.forEach((n) => walk(n, 0))
  return out
})
const rowsOf = (roots: OutlineNode[]) => visible.value.filter((v) => roots.some((r) => r === v.node || walkOutline([r]).includes(v.node)))

// ---- warnings: where the website shows a page elsewhere, or a field it ignores ----
function warningOf(p: Page): { short: string; text: string } | undefined {
  if (p.parent && !byId.value.has(p.parent) && p.state === 'live') return { short: t('site.tree.elsewhere'), text: t('site.tree.trashParent') }
  const parent = p.parent ? byId.value.get(p.parent) : undefined
  if (parent && parent.state !== 'live' && p.state === 'live') return { short: t('site.tree.elsewhere'), text: t('site.tree.draftParent', { parent: parent.navTitle || parent.title || '' }) }
  if (parent && p.section) return { short: t('site.tree.unusedSection'), text: t('site.tree.unusedSectionText', { section: p.sectionLabel ?? p.section }) }
  return undefined
}

// ---- moving ----
/** The run of roots (section) of the shown tab that holds root `id`. */
const runOf = (id: string) => {
  for (const tab of tabs.value) for (const s of tab.sections) if (s.nodes.some((n) => n.row.id === id)) return { tab, section: s }
  return undefined
}
/** Words for a place, for the message after a move. */
function placeWords(place: Place): string {
  if ('parent' in place) return t('site.tree.placeUnder', { title: titleOf(place.parent) })
  const anchor = nodes.value.get('after' in place ? place.after : place.before)
  return anchor?.section ? t('site.tree.placeIn', { name: labelOf('section', anchor.section) }) : t('site.tree.placeTop')
}
/** The place a page has now, to put it back (Undo). */
function placeNow(id: string): Place | undefined {
  const parent = parentOf.value.get(id)
  if (parent) {
    const sibs = nodes.value.get(parent)!.children.map((c) => c.row.id)
    const i = sibs.indexOf(id)
    return i > 0 ? { parent, after: sibs[i - 1]! } : { parent }
  }
  const run = runOf(id)
  if (!run) return undefined
  const roots = run.section.nodes.map((n) => n.row.id)
  const i = roots.indexOf(id)
  if (i > 0) return { after: roots[i - 1]! }
  if (roots[1]) return { before: roots[1] }
  // The only page of its section: back after the page before it in the tab, or before the one after it.
  const all = run.tab.sections.flatMap((s) => s.nodes.map((n) => n.row.id))
  const k = all.indexOf(id)
  return k > 0 ? { after: all[k - 1]! } : all[k + 1] ? { before: all[k + 1]! } : undefined
}

const focusAfter = ref<string>()
const busy = ref(false)
const pendingEmpty = ref<{ id: string; place: Place; name: string } | undefined>()

/** Moves `id` to `place`; asks first when the page is the only one under its heading (the heading would go). */
async function move(id: string, place: Place, confirmed = false) {
  if (!confirmed) {
    const run = parentOf.value.has(id) ? undefined : runOf(id)
    const anchor = 'parent' in place ? undefined : 'after' in place ? place.after : place.before
    const stays = anchor !== undefined && runOf(anchor)?.section === run?.section
    if (run?.section.title && run.section.nodes.length === 1 && !stays) {
      pendingEmpty.value = { id, place, name: labelOf('section', run.section.title) }
      return
    }
  }
  const page = byId.value.get(id)
  if (!page || busy.value) return
  const back = placeNow(id)
  busy.value = true
  focusAfter.value = id
  try {
    await ops.placeEntry(id, page.rev, place, {
      message: t('site.tree.moved', { title: titleOf(id), place: placeWords(place) }),
      undo: back ? async () => { const now = byId.value.get(id); if (now) await ops.placeEntry(id, now.rev, back) } : undefined,
    })
  } finally {
    busy.value = false
  }
}
watch(pages, async () => {
  if (!focusAfter.value) return
  const id = focusAfter.value
  focusAfter.value = undefined
  const parent = parentOf.value.get(id)
  if (parent) { const next = new Set(collapsed.value); next.delete(parent); collapsed.value = next }
  const run = runOf(walkUp(id))
  if (run && run.tab.title !== shownTab.value.title) activeTab.value = run.tab.title
  await nextTick()
  linkOf(id)?.focus()
})
const walkUp = (id: string): string => { const p = parentOf.value.get(id); return p ? walkUp(p) : id }
const linkOf = (id: string) => document.querySelector<HTMLElement>(`[data-tree-link="${id}"]`)

/** Siblings of `id` at its level: the parent's children, or the roots of its section run. */
function siblings(id: string): { list: string[]; parent?: string } {
  const parent = parentOf.value.get(id)
  if (parent) return { list: nodes.value.get(parent)!.children.map((c) => c.row.id), parent }
  return { list: runOf(id)?.section.nodes.map((n) => n.row.id) ?? [id] }
}
/** The sibling right above `id`, which Alt+→ moves it into. */
const above = (id: string): string | undefined => { const { list } = siblings(id); return list[list.indexOf(id) - 1] }
const { show } = useToast()
const sayNo = (text: string) => show(text)

function moveUp(id: string) {
  const { list, parent } = siblings(id)
  const i = list.indexOf(id)
  if (parent) {
    if (i === 0) return sayNo(t('site.tree.firstAlready'))
    return move(id, i >= 2 ? { parent, after: list[i - 2]! } : { parent })
  }
  if (i >= 2) return move(id, { after: list[i - 2]! })
  if (i === 1) return move(id, { before: list[0]! })
  // First under its heading: to the end of the section before it in this tab.
  const run = runOf(id)!
  const k = run.tab.sections.indexOf(run.section)
  if (k === 0) return sayNo(t('site.tree.topAlready'))
  return move(id, { after: run.tab.sections[k - 1]!.nodes.at(-1)!.row.id })
}
function moveDown(id: string) {
  const { list, parent } = siblings(id)
  const i = list.indexOf(id)
  if (parent) {
    if (i === list.length - 1) return sayNo(t('site.tree.lastAlready'))
    return move(id, { parent, after: list[i + 1]! })
  }
  if (i < list.length - 1) return move(id, { after: list[i + 1]! })
  // Last under its heading: first under the next heading of this tab.
  const run = runOf(id)!
  const next = run.tab.sections[run.tab.sections.indexOf(run.section) + 1]
  if (!next) return sayNo(t('site.tree.bottomAlready'))
  return move(id, { before: next.nodes[0]!.row.id })
}
function moveIn(id: string) {
  const host = above(id)
  if (!host) return sayNo(t('site.tree.noneAbove'))
  const kids = nodes.value.get(host)!.children.map((c) => c.row.id)
  return move(id, kids.length ? { parent: host, after: kids.at(-1)! } : { parent: host })
}
function moveOut(id: string) {
  const parent = parentOf.value.get(id)
  if (!parent) return sayNo(t('site.tree.topLevel'))
  const grand = parentOf.value.get(parent)
  return move(id, grand ? { parent: grand, after: parent } : { after: parent })
}
const lastChild = (id: string, except?: string) => nodes.value.get(id)!.children.map((c) => c.row.id).filter((c) => c !== except).at(-1)

function onKey(e: KeyboardEvent, id: string) {
  const step = (by: number) => {
    const list = visible.value.map((v) => v.node.row.id)
    const next = list[list.indexOf(id) + by]
    if (next) linkOf(next)?.focus()
  }
  if (e.altKey && props.canArrange && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
    e.preventDefault()
    if (e.key === 'ArrowUp') moveUp(id)
    else if (e.key === 'ArrowDown') moveDown(id)
    else if (e.key === 'ArrowRight') moveIn(id)
    else moveOut(id)
  } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault()
    step(e.key === 'ArrowDown' ? 1 : -1)
  }
}

// ---- drag and drop (fine pointers; the menu and "Move to …" do the same on phones and by keyboard) ----
const dragging = ref<string>()
const drop = ref<{ place: Place; tip: string; row?: string; zone: 'before' | 'after' | 'inside' | 'heading'; heading?: string } | undefined>()
const tipAt = ref({ x: 0, y: 0 })
function onDragStart(e: DragEvent, id: string) {
  dragging.value = id
  e.dataTransfer?.setData('text/plain', titleOf(id))
  if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move'
}
function onDragEnd() { dragging.value = undefined; drop.value = undefined }
const groupName = (id: string) => {
  const parent = parentOf.value.get(id)
  if (parent) return t('site.tree.inside', { title: titleOf(parent) })
  const s = nodes.value.get(id)?.section
  return s ? labelOf('section', s) : t('site.tree.groupTop')
}
function onDragOverRow(e: DragEvent, id: string) {
  const from = dragging.value
  if (!from) return
  if (walkOutline([nodes.value.get(from)!]).some((n) => n.row.id === id)) { drop.value = undefined; return }
  e.preventDefault()
  tipAt.value = { x: e.clientX, y: e.clientY }
  const box = (e.currentTarget as HTMLElement).getBoundingClientRect()
  const y = (e.clientY - box.top) / box.height
  const parent = parentOf.value.get(id)
  const node = nodes.value.get(id)!
  if (y < 0.3) {
    const { list } = siblings(id)
    const prev = list.slice(0, list.indexOf(id)).filter((x) => x !== from).at(-1)
    const place: Place = parent ? (prev ? { parent, after: prev } : { parent }) : prev ? { after: prev } : { before: id }
    drop.value = { place, row: id, zone: 'before', tip: t('site.tree.dropBefore', { group: groupName(id), title: titleOf(id) }) }
  } else if (y > 0.7 && !(node.children.length && !collapsed.value.has(id))) {
    drop.value = { place: parent ? { parent, after: id } : { after: id }, row: id, zone: 'after', tip: t('site.tree.dropAfter', { group: groupName(id), title: titleOf(id) }) }
  } else {
    const last = y > 0.7 ? undefined : lastChild(id, from)
    drop.value = { place: last ? { parent: id, after: last } : { parent: id }, row: id, zone: 'inside', tip: t('site.tree.dropInside', { title: titleOf(id) }) }
  }
}
function onDragOverHeading(e: DragEvent, first: string, name: string) {
  const from = dragging.value
  if (!from || first === from) return
  e.preventDefault()
  tipAt.value = { x: e.clientX, y: e.clientY }
  drop.value = { place: { before: first }, heading: first, zone: 'heading', tip: t('site.tree.dropFirst', { name }) }
}
function onDrop(e: DragEvent) {
  e.preventDefault()
  const from = dragging.value
  const target = drop.value
  onDragEnd()
  if (from && target) move(from, target.place)
}

// ---- "Move to …": every place as a list ----
const moveTo = ref<string>()
const chosen = ref<number>()
const slots = computed(() => {
  const id = moveTo.value
  if (!id) return []
  const block = new Set(walkOutline([nodes.value.get(id)!]).map((n) => n.row.id))
  const out: { label: string; depth: number; kind: 'tab' | 'heading' | 'page' | 'slot'; place?: Place }[] = []
  const walk = (n: OutlineNode, depth: number, parent?: string) => {
    out.push({ label: titleOf(n.row.id), depth, kind: 'page' })
    const kids = n.children.filter((c) => !block.has(c.row.id))
    if (!kids.length) out.push({ label: t('site.tree.inside', { title: titleOf(n.row.id) }), depth: depth + 1, kind: 'slot', place: { parent: n.row.id } })
    kids.forEach((c) => walk(c, depth + 1, n.row.id))
    out.push({ label: t('site.tree.after', { title: titleOf(n.row.id) }), depth, kind: 'slot', place: parent ? { parent, after: n.row.id } : { after: n.row.id } })
  }
  for (const tab of tabs.value) {
    if (tab.title) out.push({ label: t('site.tree.tab', { name: labelOf('tab', tab.title) }), depth: 0, kind: 'tab' })
    for (const s of tab.sections) {
      const roots = s.nodes.filter((n) => !block.has(n.row.id))
      if (s.title) out.push({ label: labelOf('section', s.title), depth: 0, kind: 'heading' })
      if (roots.length) out.push({ label: s.title ? t('site.tree.firstIn', { name: labelOf('section', s.title) }) : t('site.tree.atTop'), depth: 0, kind: 'slot', place: { before: roots[0]!.row.id } })
      roots.forEach((r) => walk(r, 0))
    }
  }
  return out
})
function openMoveTo(id: string) { chosen.value = undefined; moveTo.value = id }
// "Change" next to a page's place in its form (NavPlace) opens this list for that page.
const route = useRoute()
let askedFor: string | undefined
watch(() => [query.data.value, route.query.place] as const, ([data, place]) => {
  if (!data || typeof place !== 'string' || place === askedFor || !byId.value.has(place)) return
  askedFor = place
  openMoveTo(place)
}, { immediate: true })
function confirmMoveTo() {
  const id = moveTo.value
  const slot = chosen.value === undefined ? undefined : slots.value[chosen.value]
  if (!id || !slot?.place) return
  moveTo.value = undefined
  move(id, slot.place)
}
const subpages = computed(() => (moveTo.value ? walkOutline([nodes.value.get(moveTo.value)!]).length - 1 : 0))

// ---- new pages: the new-entry form, which puts the page here once it is created ----
function newPageAt(place: Place) {
  navigateTo({ path: `/s/${props.slug}/all/${props.brickKey}/new`, query: { place: JSON.stringify(place) } })
}
const newBelow = (id: string) => { const parent = parentOf.value.get(id); newPageAt(parent ? { parent, after: id } : { after: id }) }
const newSub = (id: string) => { const last = lastChild(id); newPageAt(last ? { parent: id, after: last } : { parent: id }) }

// ---- starting and removing a heading at a top-level page ----
const hasTabs = computed(() => props.brick.fields.tab?.type === 'text')
/** What the row menu offers for a root: start a heading there, or remove the one it starts. */
const headingOf = (id: string, field: 'section' | 'tab') => {
  if (parentOf.value.has(id)) return undefined
  const own = nodes.value.get(id)?.row[field]
  const starts = field === 'section' ? sectionHolder(runOf(id)?.section.nodes ?? [], own) === id : tabHolder(own) === id
  return starts ? { remove: labelOf(field, own) } : { start: true }
}
const newHeading = ref<{ id: string; field: 'section' | 'tab'; text: string } | undefined>()
const dropHeading = ref<{ id: string; field: 'section' | 'tab'; name: string } | undefined>()
async function confirmNewHeading() {
  const h = newHeading.value
  const page = h && byId.value.get(h.id)
  if (!h || !page || !h.text.trim()) return
  newHeading.value = undefined
  await ops.setHeading(h.id, page.rev, h.field, props.language, h.text, t(h.field === 'tab' ? 'site.tree.tabStarted' : 'site.tree.sectionStarted', { name: h.text.trim(), title: titleOf(h.id) }))
}
async function confirmDropHeading() {
  const h = dropHeading.value
  const page = h && byId.value.get(h.id)
  if (!h || !page) return
  dropHeading.value = undefined
  await ops.setHeading(h.id, page.rev, h.field, props.language, '', t('site.tree.headingRemoved', { name: h.name }))
}

// ---- renaming a heading in place ----
const editing = ref<{ field: 'section' | 'tab'; holder: string; text: string } | undefined>()
function startRename(field: 'section' | 'tab', holder: string | undefined) {
  if (!holder) return
  const p = byId.value.get(holder)!
  editing.value = { field, holder, text: (field === 'section' ? p.sectionLabel : p.tabLabel) ?? '' }
  nextTick(() => document.querySelector<HTMLInputElement>('[data-heading-input]')?.select())
}
async function finishRename(save: boolean) {
  const e = editing.value
  if (!e) return
  editing.value = undefined
  const p = byId.value.get(e.holder)
  const old = e.field === 'section' ? p?.sectionLabel : p?.tabLabel
  if (!save || !p || !e.text.trim() || e.text.trim() === old) return
  await ops.setHeading(e.holder, p.rev, e.field, props.language, e.text, t('site.tree.renamed', { name: e.text.trim() }))
}
</script>

<template>
  <section :aria-label="t('site.tree.label')">
    <p v-if="query.error.value" class="mb-3 font-semibold text-destructive" role="alert">{{ opErrorOf(query.error.value, t('basics.loadFailed')).message }}</p>
    <p v-if="!query.data.value" class="rounded-xl border bg-card px-4 py-8 text-center text-muted-foreground" role="status">{{ t('site.tree.loading') }}</p>
    <div v-else class="rounded-xl border bg-card px-2 pt-2 pb-3" @dragover.prevent @drop="onDrop">
      <!-- Tabs, as on the website (only when there are two or more). -->
      <div v-if="tabs.length > 1" class="mb-1 flex flex-wrap items-center gap-1 px-1 pt-1" role="tablist" :aria-label="t('site.tree.label')">
        <template v-for="tab in tabs" :key="tab.title">
          <Input
            v-if="editing?.field === 'tab' && editing.holder === tabHolder(tab.title)" v-model="editing.text" data-heading-input class="h-8 w-40"
            :aria-label="t('site.tree.heading')" @keydown.enter.prevent="finishRename(true)" @keydown.esc.prevent="finishRename(false)" @blur="finishRename(true)"
          />
          <button
            v-else type="button" role="tab" :aria-selected="tab === shownTab"
            class="h-8 rounded-md px-3 text-sm text-muted-foreground hover:bg-muted aria-selected:bg-muted aria-selected:font-medium aria-selected:text-foreground"
            @click="activeTab = tab.title"
          >{{ labelOf('tab', tab.title) }}</button>
        </template>
        <Button v-if="canArrange && tabHolder(shownTab.title) && !editing" type="button" variant="ghost" size="icon" class="size-8 text-muted-foreground" :aria-label="t('site.tree.renameTab', { name: labelOf('tab', shownTab.title) })" @click="startRename('tab', tabHolder(shownTab.title))">
          <PencilIcon aria-hidden="true" />
        </Button>
      </div>

      <div v-for="(sec, si) in shownTab.sections" :key="si" role="group" :aria-label="sec.title ? labelOf('section', sec.title) : undefined">
        <!-- The heading: rename in place, a new page in it, and a drop target for "first in this section". -->
        <div
          v-if="sec.title || si === 0"
          class="group/head relative flex min-h-9 items-center gap-1 rounded-md px-2 pt-3 pb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase"
          :class="{ 'pt-1': si === 0, 'bg-accent': drop?.heading === sec.nodes[0]?.row.id }"
          @dragover="sec.nodes[0] && onDragOverHeading($event, sec.nodes[0].row.id, sec.title ? labelOf('section', sec.title) : t('site.tree.groupTop'))"
        >
          <template v-if="sec.title">
            <Input
              v-if="editing?.field === 'section' && editing.holder === sectionHolder(sec.nodes, sec.title)" v-model="editing.text" data-heading-input
              class="h-8 max-w-72 text-sm font-normal tracking-normal normal-case" :aria-label="t('site.tree.heading')"
              @keydown.enter.prevent="finishRename(true)" @keydown.esc.prevent="finishRename(false)" @blur="finishRename(true)"
            />
            <h3 v-else class="m-0 text-xs font-semibold">{{ labelOf('section', sec.title) }}</h3>
            <span v-if="!editing" class="ml-auto flex opacity-0 group-hover/head:opacity-100 group-focus-within/head:opacity-100 pointer-coarse:opacity-100">
              <Button v-if="canArrange && sectionHolder(sec.nodes, sec.title)" type="button" variant="ghost" size="icon" class="size-8" :aria-label="t('site.tree.renameSection', { name: labelOf('section', sec.title) })" @click="startRename('section', sectionHolder(sec.nodes, sec.title))">
                <PencilIcon aria-hidden="true" />
              </Button>
              <Button v-if="canCreate && canArrange" type="button" variant="ghost" size="icon" class="size-8" :aria-label="t('site.tree.newInSection', { name: labelOf('section', sec.title) })" @click="newPageAt({ before: sec.nodes[0]!.row.id })">
                <PlusIcon aria-hidden="true" />
              </Button>
            </span>
          </template>
          <span v-else class="font-normal tracking-normal normal-case italic">{{ t('site.tree.beforeFirst') }}</span>
        </div>

        <ul class="m-0 list-none p-0" role="tree">
          <li
            v-for="{ node, depth } in rowsOf(sec.nodes)" :key="node.row.id" role="treeitem" :aria-level="depth + 1"
            :aria-expanded="node.children.length ? !collapsed.has(node.row.id) : undefined"
            class="group/row relative flex min-h-10 items-center gap-1 rounded-md pr-1 hover:bg-foreground/[0.03] focus-within:bg-foreground/[0.03] pointer-coarse:min-h-12"
            :class="{ 'opacity-40': dragging === node.row.id, 'bg-accent! ring-2 ring-primary ring-inset': drop?.zone === 'inside' && drop.row === node.row.id }"
            :style="{ paddingLeft: `${depth * 1.375}rem` }"
            :draggable="canArrange" :data-tree-row="node.row.id"
            @dragstart="onDragStart($event, node.row.id)" @dragend="onDragEnd" @dragover="onDragOverRow($event, node.row.id)"
          >
            <span v-if="drop?.row === node.row.id && drop.zone !== 'inside'" class="pointer-events-none absolute right-2 h-0.5 rounded bg-primary" :class="drop.zone === 'before' ? '-top-px' : '-bottom-px'" :style="{ left: `${depth * 1.375 + 1.75}rem` }" aria-hidden="true" />
            <GripVerticalIcon v-if="canArrange" class="size-4 shrink-0 cursor-grab text-muted-foreground/50 group-hover/row:text-muted-foreground pointer-coarse:hidden" aria-hidden="true" />
            <button
              v-if="node.children.length" type="button" tabindex="-1" class="grid size-6 shrink-0 place-items-center rounded text-muted-foreground hover:bg-muted"
              :aria-label="collapsed.has(node.row.id) ? t('site.tree.expand', { title: titleOf(node.row.id) }) : t('site.tree.collapse', { title: titleOf(node.row.id) })"
              @click="toggle(node.row.id)"
            >
              <ChevronRightIcon v-if="collapsed.has(node.row.id)" class="size-3.5" aria-hidden="true" /><ChevronDownIcon v-else class="size-3.5" aria-hidden="true" />
            </button>
            <span v-else class="size-6 shrink-0" aria-hidden="true" />
            <NuxtLink
              :to="`/s/${slug}/all/${brickKey}/${node.row.id}`" :data-tree-link="node.row.id"
              class="min-w-0 flex-1 truncate py-2 text-foreground no-underline outline-none focus-visible:rounded focus-visible:ring-3 focus-visible:ring-ring/80 min-[900px]:text-sm"
              :class="{ 'text-muted-foreground': byId.get(node.row.id)?.state !== 'live' }"
              @keydown="onKey($event, node.row.id)"
            >{{ titleOf(node.row.id) }}</NuxtLink>
            <Badge v-if="byId.get(node.row.id)?.badge" variant="info">{{ byId.get(node.row.id)?.badge }}</Badge>
            <Badge v-if="byId.get(node.row.id)?.state !== 'live'" variant="outline">{{ t('site.status.draft') }}</Badge>
            <Badge
              v-if="warningOf(byId.get(node.row.id)!)" variant="warning" class="gap-1"
              :title="warningOf(byId.get(node.row.id)!)!.text"
            >
              <TriangleAlertIcon class="size-3" aria-hidden="true" />{{ warningOf(byId.get(node.row.id)!)!.short }}
              <span class="sr-only">: {{ warningOf(byId.get(node.row.id)!)!.text }}</span>
            </Badge>
            <DropdownMenu v-if="canArrange">
              <DropdownMenuTrigger as-child>
                <Button type="button" variant="ghost" size="icon" class="size-8 text-muted-foreground opacity-0 group-hover/row:opacity-100 group-focus-within/row:opacity-100 aria-expanded:opacity-100 pointer-coarse:size-11 pointer-coarse:opacity-100" :aria-label="t('site.tree.actions', { title: titleOf(node.row.id) })">
                  <EllipsisIcon aria-hidden="true" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" class="min-w-56">
                <DropdownMenuItem @select="navigateTo(`/s/${slug}/all/${brickKey}/${node.row.id}`)">{{ t('site.tree.open') }}</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem @select="moveUp(node.row.id)">{{ t('site.tree.moveUp') }}<DropdownMenuShortcut>Alt ↑</DropdownMenuShortcut></DropdownMenuItem>
                <DropdownMenuItem @select="moveDown(node.row.id)">{{ t('site.tree.moveDown') }}<DropdownMenuShortcut>Alt ↓</DropdownMenuShortcut></DropdownMenuItem>
                <DropdownMenuItem :disabled="!above(node.row.id)" @select="moveIn(node.row.id)">
                  {{ above(node.row.id) ? t('site.tree.moveInto', { title: titleOf(above(node.row.id)!) }) : t('site.tree.moveIntoAbove') }}<DropdownMenuShortcut>Alt →</DropdownMenuShortcut>
                </DropdownMenuItem>
                <DropdownMenuItem :disabled="!parentOf.has(node.row.id)" @select="moveOut(node.row.id)">{{ t('site.tree.moveOut') }}<DropdownMenuShortcut>Alt ←</DropdownMenuShortcut></DropdownMenuItem>
                <DropdownMenuItem @select="openMoveTo(node.row.id)">{{ t('site.tree.moveTo') }}</DropdownMenuItem>
                <template v-if="!parentOf.has(node.row.id)">
                  <DropdownMenuSeparator />
                  <DropdownMenuItem v-if="headingOf(node.row.id, 'section')?.start" @select="newHeading = { id: node.row.id, field: 'section', text: '' }">{{ t('site.tree.startSection') }}</DropdownMenuItem>
                  <DropdownMenuItem v-else @select="dropHeading = { id: node.row.id, field: 'section', name: headingOf(node.row.id, 'section')!.remove! }">{{ t('site.tree.removeSection') }}</DropdownMenuItem>
                  <template v-if="hasTabs">
                    <DropdownMenuItem v-if="headingOf(node.row.id, 'tab')?.start" @select="newHeading = { id: node.row.id, field: 'tab', text: '' }">{{ t('site.tree.startTab') }}</DropdownMenuItem>
                    <DropdownMenuItem v-else @select="dropHeading = { id: node.row.id, field: 'tab', name: headingOf(node.row.id, 'tab')!.remove! }">{{ t('site.tree.removeTab') }}</DropdownMenuItem>
                  </template>
                </template>
                <template v-if="canCreate">
                  <DropdownMenuSeparator />
                  <DropdownMenuItem @select="newBelow(node.row.id)">{{ t('site.tree.newBelow') }}</DropdownMenuItem>
                  <DropdownMenuItem @select="newSub(node.row.id)">{{ t('site.tree.newSub') }}</DropdownMenuItem>
                </template>
              </DropdownMenuContent>
            </DropdownMenu>
          </li>
        </ul>
      </div>
    </div>
    <div v-if="canArrange && query.data.value" class="flex flex-wrap gap-x-4 gap-y-1 px-1 pt-2 text-[13px] text-muted-foreground">
      <span class="pointer-coarse:hidden">{{ t('site.tree.hint') }}</span>
      <span class="pointer-coarse:hidden">{{ t('site.tree.keys') }}</span>
      <span>{{ t('site.tree.live') }}</span>
    </div>
    <!-- Where the page will land while dragging. -->
    <div v-if="drop && dragging" class="pointer-events-none fixed z-50 rounded-md bg-foreground px-2 py-1 text-xs text-background" :style="{ left: `${tipAt.x + 14}px`, top: `${tipAt.y + 14}px` }" aria-hidden="true">→ {{ drop.tip }}</div>

    <Dialog :open="!!moveTo" @update:open="(open) => { if (!open) moveTo = undefined }">
      <DialogContent class="flex max-h-[85dvh] flex-col sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{{ t('site.tree.moveToTitle', { title: moveTo ? titleOf(moveTo) : '' }) }}</DialogTitle>
          <DialogDescription>{{ t('site.tree.moveToHint', { count: subpages }) }}</DialogDescription>
        </DialogHeader>
        <div class="-mx-2 min-h-0 flex-1 overflow-y-auto px-2" role="radiogroup" :aria-label="t('site.tree.moveTo')">
          <template v-for="(slot, i) in slots" :key="i">
            <button
              v-if="slot.kind === 'slot'" type="button" role="radio" :aria-checked="chosen === i"
              class="block w-full rounded-md border border-dashed border-transparent py-1.5 pr-2 text-left text-sm text-muted-foreground hover:border-primary hover:bg-accent hover:text-accent-foreground aria-checked:border-solid aria-checked:border-primary aria-checked:bg-accent aria-checked:font-medium aria-checked:text-accent-foreground"
              :style="{ paddingLeft: `${0.5 + slot.depth * 1.125}rem` }" @click="chosen = i" @dblclick="chosen = i; confirmMoveTo()"
            >↳ {{ slot.label }}</button>
            <p v-else class="m-0 py-1 pr-2 text-sm" :class="slot.kind === 'page' ? 'text-foreground' : 'pt-3 text-xs font-semibold tracking-wide text-muted-foreground uppercase'" :style="{ paddingLeft: `${0.5 + slot.depth * 1.125}rem` }">{{ slot.label }}</p>
          </template>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" @click="moveTo = undefined">{{ t('site.common.cancel') }}</Button>
          <Button type="button" :disabled="chosen === undefined" @click="confirmMoveTo">{{ t('site.tree.moveHere') }}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <Dialog :open="!!newHeading" @update:open="(open) => { if (!open) newHeading = undefined }">
      <DialogContent class="sm:max-w-md">
        <form class="grid gap-4" @submit.prevent="confirmNewHeading">
          <DialogHeader>
            <DialogTitle>{{ newHeading?.field === 'tab' ? t('site.tree.startTab') : t('site.tree.startSection') }}</DialogTitle>
            <DialogDescription>{{ t(newHeading?.field === 'tab' ? 'site.tree.startTabText' : 'site.tree.startSectionText', { title: newHeading ? titleOf(newHeading.id) : '' }) }}</DialogDescription>
          </DialogHeader>
          <Input v-if="newHeading" v-model="newHeading.text" :aria-label="t('site.tree.heading')" :maxlength="newHeading.field === 'tab' ? 30 : undefined" autofocus />
          <DialogFooter>
            <Button type="button" variant="outline" @click="newHeading = undefined">{{ t('site.common.cancel') }}</Button>
            <Button type="submit" :disabled="!newHeading?.text.trim()">{{ t('site.tree.startConfirm') }}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>

    <Dialog :open="!!dropHeading" @update:open="(open) => { if (!open) dropHeading = undefined }">
      <DialogContent class="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{{ t('site.tree.removeTitle', { name: dropHeading?.name ?? '' }) }}</DialogTitle>
          <DialogDescription>{{ t(dropHeading?.field === 'tab' ? 'site.tree.removeTabText' : 'site.tree.removeSectionText', { name: dropHeading?.name ?? '' }) }}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="outline" @click="dropHeading = undefined">{{ t('site.common.cancel') }}</Button>
          <Button type="button" variant="destructive" @click="confirmDropHeading">{{ t('site.tree.removeConfirm') }}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <Dialog :open="!!pendingEmpty" @update:open="(open) => { if (!open) pendingEmpty = undefined }">
      <DialogContent class="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{{ t('site.tree.emptyTitle', { name: pendingEmpty?.name ?? '' }) }}</DialogTitle>
          <DialogDescription>{{ t('site.tree.emptyText', { title: pendingEmpty ? titleOf(pendingEmpty.id) : '', name: pendingEmpty?.name ?? '' }) }}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="outline" @click="pendingEmpty = undefined">{{ t('site.common.cancel') }}</Button>
          <Button type="button" @click="() => { const p = pendingEmpty!; pendingEmpty = undefined; move(p.id, p.place, true) }">{{ t('site.tree.emptyConfirm') }}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </section>
</template>
