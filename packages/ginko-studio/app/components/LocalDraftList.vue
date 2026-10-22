<!-- Heute and Alles bearbeiten: the person's unsaved input that this browser kept (N2) after a crash, a reload or a
     closed tab, with a way back to each form. Restoring stays the form's own offer (LocalDraftOffer); this list never
     applies anything. With `recent` (the Content overview on wide screens) it is the "Continue editing" card: the unsaved
     input first, marked "Not saved", then the entries opened last in this browser, five rows at most. -->
<script setup lang="ts">
import type { Locale, Task } from '@lupinum/ginko'
import type { Schema } from '@lupinum/ginko/internal'
import { FileTextIcon } from '@lucide/vue'
import { Badge } from '@studio/components/ui/badge'
import { Button } from '@studio/components/ui/button'
import type { RecentEntry } from '../composables/useRecentEntries'
import { useLocalDraftRows } from '../composables/useLocalDraftRows'
import { changedText, deviceZone } from '../utils/when'

const props = defineProps<{
  slug: string
  schema: Schema
  main: Locale
  /** The areas the person may open in Alles bearbeiten. */
  bricks: readonly string[]
  /** The person's create task `id` of area `brick`, for input typed in its sheet; undefined when they may not use it. */
  taskOf: (brick: string, id: string) => Task | undefined
  /** The entries opened last in this browser: shows the list as the "Continue editing" card. */
  recent?: readonly RecentEntry[]
}>()
const emit = defineEmits<{ task: [brick: string, task: Task] }>()
const { t, format } = useI18n()
const rows = useLocalDraftRows(props)
const MAX = 5
// An entry with unsaved input is listed once, as unsaved. Only areas the person can open: the list lives in the browser,
// not per person, so entries a colleague opened here would otherwise show up (the unsaved rows are filtered the same way).
// `/s/<slug>/all/<brick>[/<entry>]`: the area is the fifth part, a single page has no entry part.
const brickOf = (to: string) => to.split('/')[4] ?? ''
const opened = computed(() => (props.recent ?? [])
  .filter((r) => props.bricks.includes(brickOf(r.to)) && !rows.value.some((row) => row.to === r.to))
  .slice(0, Math.max(0, MAX - rows.value.length)))
const secondLine = (r: RecentEntry) => (r.to.split('/').length <= 5 ? t('site.all.single') : r.area)
const openedAt = (r: RecentEntry) => (r.at ? changedText(r.at, deviceZone(), { t, format }) : '')
const rowClass = 'relative flex min-h-16 items-center gap-3 px-4 py-3 hover:bg-foreground/[0.03] focus-within:bg-foreground/[0.03]'
const linkClass = 'line-clamp-1 font-medium text-foreground no-underline outline-none after:absolute after:inset-0 after:rounded-[inherit] focus-visible:after:ring-3 focus-visible:after:ring-ring/80 focus-visible:after:ring-inset'
</script>

<template>
  <section v-if="recent && (rows.length || opened.length)" class="mb-8" aria-labelledby="local-drafts">
    <h2 id="local-drafts" class="mb-3 text-base font-semibold">{{ t('site.quick.drafts.continue') }}</h2>
    <ul class="m-0 list-none divide-y overflow-hidden rounded-xl border bg-card p-0">
      <li v-for="row in rows" :key="row.key" :class="rowClass">
        <span class="flex size-10 flex-none items-center justify-center rounded-md bg-muted text-muted-foreground" aria-hidden="true"><FileTextIcon class="size-4" /></span>
        <span class="min-w-0 flex-1 text-sm">
          <NuxtLink v-if="row.to" :to="row.to" :class="linkClass">{{ row.name }}</NuxtLink>
          <button v-else-if="row.task" type="button" :class="[linkClass, 'text-left']" @click="emit('task', row.task.brick, row.task.task)">{{ row.name }}</button>
          <span class="block truncate text-[13px] text-muted-foreground">{{ row.area }}</span>
        </span>
        <Badge variant="warning">{{ t('site.all.notSaved') }}</Badge>
        <span class="hidden flex-none text-[13px] text-muted-foreground tabular-nums sm:block">{{ row.time }}</span>
      </li>
      <li v-for="r in opened" :key="r.to" :class="rowClass">
        <span class="flex size-10 flex-none items-center justify-center rounded-md bg-muted text-muted-foreground" aria-hidden="true"><FileTextIcon class="size-4" /></span>
        <span class="min-w-0 flex-1 text-sm">
          <NuxtLink :to="r.to" :class="linkClass">{{ r.label }}</NuxtLink>
          <span class="block truncate text-[13px] text-muted-foreground">{{ secondLine(r) }}</span>
        </span>
        <span v-if="openedAt(r)" class="hidden flex-none text-[13px] text-muted-foreground tabular-nums sm:block">{{ openedAt(r) }}</span>
      </li>
    </ul>
  </section>
  <section v-else-if="rows.length" class="mb-7 grid gap-3" aria-labelledby="local-drafts">
    <h2 id="local-drafts" class="text-[17px] font-semibold">{{ t('site.quick.drafts.heading') }}</h2>
    <ul class="m-0 list-none overflow-hidden rounded-xl border p-0">
      <li v-for="(row, i) in rows" :key="row.key" class="flex flex-wrap items-center gap-x-3 gap-y-2 border-b px-4 py-3 last:border-b-0">
        <span :id="`local-draft-${i}`" class="min-w-0 flex-1 break-words">{{ row.text }}</span>
        <Button v-if="row.to" as-child variant="outline" size="sm"><NuxtLink :to="row.to" :aria-describedby="`local-draft-${i}`">{{ t('site.quick.drafts.continue') }}</NuxtLink></Button>
        <Button v-else-if="row.task" type="button" variant="outline" size="sm" :aria-describedby="`local-draft-${i}`" @click="emit('task', row.task.brick, row.task.task)">{{ t('site.quick.drafts.continue') }}</Button>
      </li>
    </ul>
  </section>
</template>
