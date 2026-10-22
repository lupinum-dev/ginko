<!-- What a timed collection has on the website (UI.md 3): one row per entry with its timing and yes/no badges
     ("Ausgebucht"), the whole row opening the entry when it opens something, "Entfernen" while the list is short. A long
     list shows its first rows until opened; expired rows follow on request; the area list is linked when cut. -->
<script setup lang="ts">
import { inject } from 'vue'
import { ChevronRightIcon } from '@lucide/vue'
import { Badge } from '@studio/components/ui/badge'
import { Button } from '@studio/components/ui/button'
import { Skeleton } from '@studio/components/ui/skeleton'
import type { Listing, Section } from '../../composables/useTodayAreas'
import { shownLabel } from '../../utils/labels'
import { TODAY } from './context'

const props = defineProps<{
  sec: Section
  listing: Listing
  /** entries.ofBricks is loading: row skeletons. */
  pending: boolean
  /** A plan's rows sit under its h3, which names them; a card's main rows get "Auf der Website". */
  plan: boolean
}>()
const { t } = useI18n()
const ctx = inject(TODAY)!

const labelId = () => (props.plan ? `b-${props.sec.key}` : `b-${props.sec.key}-rows`)
/** "Entfernen" on each row: the remove task is not in "⋯" (a short timed list). */
const removeTask = () => (props.sec.removeOnRows ? props.sec.remove : undefined)
// The whole row is the target (one link or button named by the title); "Entfernen" sits above its stretched area.
const targetClass = 'flex min-w-0 flex-1 items-center gap-2 bg-transparent p-0 text-left text-foreground no-underline outline-none after:absolute after:inset-0 after:rounded-[inherit] focus-visible:after:ring-3 focus-visible:after:ring-ring/80 focus-visible:after:ring-inset'
</script>

<template>
  <div class="grid gap-2">
    <!-- The caption names a list: none when there is no list to name. -->
    <p v-if="!plan && (pending || listing.rows.length)" :id="labelId()" class="text-xs text-muted-foreground">{{ t('today.rows.label') }}</p>
    <div v-if="pending" class="grid gap-1.5" aria-hidden="true">
      <Skeleton class="h-11 rounded-md" />
      <Skeleton class="h-11 rounded-md" />
    </div>
    <template v-else>
      <ul v-if="listing.rows.length" tabindex="-1" :aria-labelledby="labelId()" class="m-0 list-none overflow-hidden rounded-lg border border-border/70 p-0 outline-none focus-visible:ring-3 focus-visible:ring-ring/80 dark:border-border/50">
        <li
          v-for="row in listing.rows"
          :key="row.e._id"
          class="group/row relative flex min-h-12 items-center gap-2 border-b px-3 py-2 last:border-b-0 max-[679px]:min-h-14 dark:border-border/50"
          :class="row.target && 'hover:bg-foreground/[0.03] focus-within:bg-foreground/[0.03]'"
          :data-dim="row.timing.dim || undefined"
        >
          <button v-if="row.target && 'task' in row.target" type="button" :class="[targetClass, 'cursor-pointer']" @click="ctx.openRow(sec.key, row.target.task, row.e._id)">
            <span class="grid min-w-0 flex-1 gap-0.5">
              <span class="text-sm font-medium [overflow-wrap:anywhere] group-data-dim/row:font-normal group-data-dim/row:text-muted-foreground">{{ row.title }}</span>
              <span class="flex flex-wrap items-center gap-1.5 text-[13px] text-muted-foreground tabular-nums">
                <span v-if="row.timing.text">{{ row.timing.text }}</span>
                <Badge v-for="flag in row.flags" :key="flag" variant="outline">{{ flag }}</Badge>
              </span>
            </span>
            <ChevronRightIcon class="size-4 flex-none text-muted-foreground" aria-hidden="true" />
          </button>
          <NuxtLink v-else-if="row.target" :to="row.target.to" :class="targetClass">
            <span class="grid min-w-0 flex-1 gap-0.5">
              <span class="text-sm font-medium [overflow-wrap:anywhere] group-data-dim/row:font-normal group-data-dim/row:text-muted-foreground">{{ row.title }}</span>
              <span class="flex flex-wrap items-center gap-1.5 text-[13px] text-muted-foreground tabular-nums">
                <span v-if="row.timing.text">{{ row.timing.text }}</span>
                <Badge v-for="flag in row.flags" :key="flag" variant="outline">{{ flag }}</Badge>
              </span>
            </span>
            <ChevronRightIcon class="size-4 flex-none text-muted-foreground" aria-hidden="true" />
          </NuxtLink>
          <span v-else :class="targetClass">
            <span class="grid min-w-0 flex-1 gap-0.5">
              <span class="text-sm font-medium [overflow-wrap:anywhere] group-data-dim/row:font-normal group-data-dim/row:text-muted-foreground">{{ row.title }}</span>
              <span class="flex flex-wrap items-center gap-1.5 text-[13px] text-muted-foreground tabular-nums">
                <span v-if="row.timing.text">{{ row.timing.text }}</span>
                <Badge v-for="flag in row.flags" :key="flag" variant="outline">{{ flag }}</Badge>
              </span>
            </span>
          </span>
          <Button
            v-if="removeTask()"
            type="button"
            variant="ghost"
            size="sm"
            class="relative z-10 max-[679px]:min-h-12"
            :disabled="ctx.removing.has(row.e._id)"
            :aria-label="t('site.quick.removeNamed', { title: row.title })"
            @click="ctx.remove(sec.key, row.e, removeTask()!)"
          >{{ t('site.common.remove') }}</Button>
        </li>
      </ul>
      <Button v-if="listing.collapsed > 0" type="button" variant="ghost" size="sm" class="justify-self-start max-[679px]:min-h-12" @click="ctx.expand(sec.key)">{{ t('site.all.showMore', { count: listing.collapsed }) }}</Button>
      <div v-if="!listing.rows.length || listing.hiddenExpired || listing.more" class="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px]">
        <p v-if="!listing.rows.length && !listing.hiddenExpired" class="text-muted-foreground">{{ t('site.quick.nothingNow') }}</p>
        <p v-else-if="!listing.rows.length" class="text-muted-foreground">{{ t('today.nothingOnline') }}</p>
        <Button v-if="listing.hiddenExpired" type="button" variant="link" size="sm" class="h-auto px-0 max-[679px]:min-h-12" @click="ctx.showExpired(sec.key)">{{ t('site.quick.showExpired', { count: listing.hiddenExpired }) }}</Button>
        <Button v-if="listing.more" as-child variant="link" size="sm" class="h-auto px-0 max-[679px]:min-h-12">
          <NuxtLink :to="`/s/${ctx.slug}/all/${sec.key}`">{{ t('site.quick.allIn', { brick: shownLabel(sec.brick.label, ctx.main) }) }}</NuxtLink>
        </Button>
      </div>
    </template>
  </div>
</template>
