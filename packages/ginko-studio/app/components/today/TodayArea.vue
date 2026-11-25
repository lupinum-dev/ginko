<!-- One section of a Today card (UI.md 3): its state (status line, today flag with Aufheben, the week, the person's own
     proposals), its task row (the daily task first, the rare ones behind "⋯") and what it has on the website. Buttons
     come before the rows, so the frequent button keeps its place whatever the number of rows. -->
<script setup lang="ts">
import { computed, inject } from 'vue'
import { CircleAlertIcon, CircleXIcon, ClockIcon, EllipsisIcon } from '@lucide/vue'
import { Button } from '@studio/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@studio/components/ui/dropdown-menu'
import { Skeleton } from '@studio/components/ui/skeleton'
import type { Section, View } from '../../composables/useTodayAreas'
import type { Task } from '../../utils/content'
import { shownLabel } from '../../utils/labels'
import TodayDrafts from '../TodayDrafts.vue'
import TodayRows from './TodayRows.vue'
import { TODAY } from './context'

const props = defineProps<{
  sec: Section
  view: View
  /** A plan section inside its owner's card: its first task is outline unless due. */
  plan: boolean
  /** The card's main section is due: it keeps the card's one filled button. */
  ownerDue?: boolean
  /** The tinted hours card of an open day: the times stand large, and its buttons are quiet. */
  tinted?: boolean
  ownLine: (p: View['waiting'][number]) => string
  ownWhen: (at: number) => string
}>()
const { t, format } = useI18n()
const ctx = inject(TODAY)!

const label = (task: Task) => shownLabel(task.label, ctx.main)
const area = computed(() => shownLabel(props.sec.brick.label, ctx.main))
const main = computed(() => props.view.split.buttons[0])
const others = computed(() => props.view.split.buttons.slice(1))
// A card's first task is its filled button. A plan's task is filled only when the plan is due and the card is not.
const mainVariant = computed(() => (props.tinted ? 'outline' : !props.plan || (props.view.due && !props.ownerDue) ? 'default' : 'outline'))
// On a phone the buttons are full width and the cards stand in one column: a filled bar in every card would hide the
// one that is due. So there only a due section keeps the fill; the others look like outline buttons.
const calmOnPhone = computed(() => !props.view.due && mainVariant.value === 'default' && '@max-[680px]:border @max-[680px]:border-input @max-[680px]:bg-background @max-[680px]:text-foreground @max-[680px]:hover:bg-muted')
const day = (date: string) => format.date(date, { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })
const hasState = computed(() => {
  const v = props.view
  return !!((v.status && !v.flagIsHours) || v.statusPending || v.flag || v.week || v.waiting.length || v.rejected.length)
})

// A task started from "⋯": the menu must not take the focus back while the sheet opens; the sheet gives it to the
// trigger when it closes (the page's launcher).
const triggerId = computed(() => `more-${props.sec.key}`)
let fromMenu = false
function startFromMenu(task: Task) {
  fromMenu = true
  ctx.start(props.sec.key, task, document.getElementById(triggerId.value) ?? undefined)
}
function menuClosed(event: Event) {
  if (!fromMenu) return
  fromMenu = false
  event.preventDefault()
}
</script>

<template>
  <!-- A card's state stands close under its heading (the card's gap is for its parts). -->
  <div v-if="hasState" class="grid gap-1.5" :class="!plan && !(tinted && view.status?.open) && '-mt-2'">
    <template v-if="view.status && !view.flagIsHours">
      <p v-if="view.status.due" class="flex items-start gap-1.5 text-[13px] leading-[1.45] font-semibold text-warning" data-test="status">
        <CircleAlertIcon class="mt-px size-4 flex-none" aria-hidden="true" /><span>{{ view.status.text }}</span>
      </p>
      <!-- One sentence in two sizes; the space between the parts keeps it a sentence for a screen reader. -->
      <p v-else-if="tinted && view.status.open" class="grid gap-0.5" data-test="status">
        <span class="flex items-center gap-[7px] text-[13px] font-semibold text-accent-foreground"><span class="size-2 flex-none rounded-full bg-ring" aria-hidden="true" />{{ view.status.open.lead }}</span> <span class="font-display leading-[1.1] font-extrabold tracking-[-0.03em] text-balance tabular-nums" :class="view.status.open.count > 1 ? 'text-[28px]' : 'text-[40px]'">{{ view.status.open.times }}</span>
      </p>
      <p v-else class="text-[13px] leading-[1.45] text-muted-foreground" data-test="status">{{ view.status.text }}</p>
    </template>
    <Skeleton v-else-if="view.statusPending" class="h-5 w-48" />

    <div v-if="view.flag" class="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-lg bg-warning/10 px-3 py-2 text-sm">
      <p class="min-w-0 [overflow-wrap:anywhere]">
        <span v-if="view.flagIsHours" data-test="status">{{ view.status!.text }}</span>
        <I18nT v-else-if="view.flag.date === ctx.today" k="site.quick.todayDone" :params="{ task: label(view.flag.task) }"><template #task="{ text }"><strong>{{ text }}</strong></template></I18nT>
        <I18nT v-else k="site.quick.dayDone" :params="{ field: shownLabel(view.flag.field.label, ctx.main), date: day(view.flag.date) }"><template #task="{ text }"><strong>{{ text }}</strong></template></I18nT>
        <span v-for="text in view.flagTexts" :key="text" class="mt-0.5 block">{{ t('site.quick.flagText', { text }) }}</span>
      </p>
      <Button type="button" variant="outline" size="sm" class="max-sm:min-h-12" :disabled="ctx.lifting" @click="ctx.lift(view.flag, sec.key)">{{ t('site.quick.clearToday') }}</Button>
    </div>

    <template v-if="view.week">
      <!-- Not current but not due: the person's own week waits for approval (the line under it says so). -->
      <p v-if="view.week.current || !view.due" class="text-[13px] leading-[1.45] text-muted-foreground">{{ view.week.text }}</p>
      <p v-else class="flex items-start gap-1.5 text-[13px] leading-[1.45] font-semibold text-warning">
        <CircleAlertIcon class="mt-px size-4 flex-none" aria-hidden="true" /><span>{{ view.week.text }}</span>
      </p>
    </template>

    <p v-for="p in view.waiting" :key="p.proposal" class="flex gap-1.5 text-[13px] text-muted-foreground" data-test="own-waiting">
      <ClockIcon class="mt-0.5 size-3.5 flex-none" aria-hidden="true" /><span class="min-w-0 [overflow-wrap:anywhere]">{{ ownLine(p) }} · {{ t('site.quick.waiting', { when: ownWhen(p.createdAt) }) }}</span>
    </p>
    <p v-for="p in view.rejected" :key="p.proposal" class="flex gap-1.5 text-[13px] text-muted-foreground" data-test="own-rejected-note">
      <CircleXIcon class="mt-0.5 size-3.5 flex-none" aria-hidden="true" /><span class="min-w-0 [overflow-wrap:anywhere]">{{ t('today.rejectedNote', { line: ownLine(p) }) }}</span>
    </p>
  </div>

  <!-- Phone: the card's main task full width, the others in two columns; with two card columns they wrap in one row. -->
  <div v-if="main || view.split.more.length" class="grid gap-2 @[680px]:flex @[680px]:flex-wrap @[680px]:items-center">
    <Button v-if="main && !plan" type="button" :variant="mainVariant" class="w-full @[680px]:w-auto @max-[680px]:min-h-12" :class="calmOnPhone" @click="ctx.start(sec.key, main)">{{ label(main) }}</Button>
    <div v-if="plan || others.length || view.split.more.length" class="grid gap-2 @[680px]:contents" :class="plan ? 'grid-cols-[minmax(0,1fr)_auto]' : 'grid-cols-2 [&>:last-child:nth-child(odd):not([aria-haspopup])]:col-span-2'">
      <!-- A plan's one task shares its phone row with a narrow "⋯": the card's own main task stays the one full-width button. -->
      <Button v-if="main && plan" type="button" :variant="mainVariant" class="min-w-0 @max-[680px]:min-h-12 @max-[680px]:w-full" :class="!view.split.more.length && 'col-span-2'" :title="label(main)" @click="ctx.start(sec.key, main)"><span class="truncate">{{ label(main) }}</span></Button>
      <Button v-for="task in others" :key="task.id" type="button" variant="outline" class="@max-[680px]:h-auto @max-[680px]:min-h-12 @max-[680px]:w-full @max-[680px]:whitespace-normal @max-[680px]:py-1.5 @max-[680px]:leading-[18px]" @click="ctx.start(sec.key, task)">{{ label(task) }}</Button>
      <DropdownMenu v-if="view.split.more.length">
        <DropdownMenuTrigger as-child>
          <Button :id="triggerId" type="button" variant="outline" size="icon" :class="plan ? '@max-[680px]:size-12' : '@max-[680px]:h-auto @max-[680px]:min-h-12 @max-[680px]:w-full'" :aria-label="t('today.moreTasks', { area })" :title="t('today.moreTasks', { area })">
            <EllipsisIcon class="size-4" aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" @close-auto-focus="menuClosed">
          <DropdownMenuItem v-for="task in view.split.more" :key="task.id" class="min-h-9 pointer-coarse:min-h-12" @select="startFromMenu(task)">{{ label(task) }}</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  </div>

  <!-- Rows that failed to load are unknown: no list and no "nothing listed" (the page shows the load error). -->
  <TodayRows v-if="ctx.isTimed(sec.brick) && view.rows !== 'unknown'" :sec="sec" :listing="view.listing" :pending="view.rows === 'loading'" :plan="plan" />

  <TodayDrafts
    :slug="ctx.slug" :brick-key="sec.key" :brick="sec.brick" :entries="ctx.entriesOf(sec.key)" :tasks="sec.tasks"
    :is-manager="ctx.isManager" :main="ctx.main" :time-zone="ctx.timeZone"
  />
</template>
