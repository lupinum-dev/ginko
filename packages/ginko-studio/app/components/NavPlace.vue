<!-- Where a page of a navigation tree sits, as one line in its form (tab › section › parents › page). The tree in the
     area's list places it; the form no longer shows the Section, Parent and Tab fields. A new page (no `entry`) shows
     where it will land: at the end, or at `place` from "New page here". -->
<script setup lang="ts">
import { api } from '#convex/api'
import { applyPlace, navTabs, outline, placePlan, walkOutline, type OutlineRow, type Place } from '@lupinum/ginko/internal'
import { Button } from '@studio/components/ui/button'

const props = defineProps<{ slug: string; brickKey: string; entry?: string; place?: Place; language: string; newDraft?: boolean }>()
const { t } = useI18n()
const query = useConvexQuery(api.navigation.tree, () => ({ site: props.slug, brick: props.brickKey, language: props.language }))
// Stands for the page that does not exist yet; no stored id is empty.
const NEW = ''

const crumbs = computed(() => {
  const pages = query.data.value ?? []
  const byId = new Map(pages.map((p) => [p.id, p]))
  let rows: OutlineRow[] = pages
  const id = props.entry ?? NEW
  if (id === NEW) {
    // A new page is stored last, without section or parent (entries.create), a draft where the area has drafts; then
    // it moves to its place.
    rows = [...rows, { id, ...(props.newDraft ? { draft: true } : {}) }]
    const plan = props.place && placePlan(rows, id, props.place)
    if (plan && typeof plan !== 'string') rows = applyPlace(rows, plan)
  }
  if (!rows.some((r) => r.id === id)) return []
  const tree = outline(rows)
  const up = new Map<string, string>()
  for (const n of walkOutline(tree)) for (const c of n.children) up.set(c.row.id, n.row.id)
  const chain: string[] = []
  for (let at: string | undefined = id; at !== undefined; at = up.get(at)) chain.unshift(at)
  const root = tree.find((n) => n.row.id === chain[0])
  const label = (key: 'section' | 'tab', text?: string) => { const p = text ? pages.find((x) => x[key] === text) : undefined; return (key === 'section' ? p?.sectionLabel : p?.tabLabel) || text }
  const showTabs = navTabs(tree).length > 1
  return [
    ...(showTabs && root?.tab ? [label('tab', root.tab)!] : []),
    ...(root?.section ? [label('section', root.section)!] : []),
    ...chain.map((at) => (at === NEW ? t('site.tree.thisPage') : byId.get(at)!.navTitle || byId.get(at)!.title || '')),
  ]
})
</script>

<template>
  <div v-if="crumbs.length" class="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border bg-muted/40 px-3 py-2.5">
    <div class="min-w-0 flex-1">
      <p class="m-0 text-[13px] font-medium text-muted-foreground">{{ entry ? t('site.tree.place') : t('site.tree.placeNew') }}</p>
      <p class="m-0 text-sm break-words">
        <template v-for="(c, i) in crumbs" :key="i"><span v-if="i" class="px-1 text-muted-foreground" aria-hidden="true">›</span><span :class="{ 'font-medium': i === crumbs.length - 1 }">{{ c }}</span></template>
      </p>
    </div>
    <Button v-if="entry" variant="outline" size="sm" as-child>
      <NuxtLink :to="{ path: `/s/${slug}/all/${brickKey}`, query: { place: entry } }">{{ t('site.tree.change') }}</NuxtLink>
    </Button>
  </div>
</template>
