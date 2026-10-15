<!-- The drafts of one collection on Heute (TEMPLATES 7.2): staff see the drafts they made, owners and admins all of them;
     newest first, at most five, each with the one step that moves it on. The step follows the person's task: with
     needsApproval the draft goes to review, otherwise it goes online. -->
<script setup lang="ts">
import type { CollectionBrick } from '@lupinum/ginko'
import type { Entry } from '../composables/useSiteData'
import { opErrorOf } from '../composables/useOps'
import { taskRef, titleOf, type Task } from '../utils/content'
import { whenWeekday } from '../utils/when'
import { Button } from '@studio/components/ui/button'

const props = defineProps<{
  slug: string
  brickKey: string
  brick: CollectionBrick
  /** Every entry of the brick the page read (live ones too). */
  entries: readonly Entry[]
  /** The tasks of this brick the person may do. */
  tasks: readonly Task[]
  /** Owners and admins see every draft; staff only their own. */
  isManager: boolean
  main: string
  timeZone: string
}>()
const { t, format } = useI18n()
const ops = useOps(computed(() => props.slug))
const { show } = useToast()

const SHOWN = 5
const drafts = computed(() => props.entries
  .filter((e) => e.state === 'draft' && !e.deleted && (props.isManager || e.own))
  .toSorted((a, b) => (b.since ?? 0) - (a.since ?? 0)))
const rows = computed(() => drafts.value.slice(0, SHOWN))
const more = computed(() => drafts.value.length > SHOWN)

/** The same rule as the server's publish: any create or edit task the staff holds that needs approval sends it to review. */
const review = computed(() => !props.isManager && props.tasks.some((task) => task.kind !== 'remove' && task.needsApproval === true))
/** Publishing belongs to the brick's edit and create tasks (staff need one of them). */
const publishTask = computed(() => props.tasks.find((task) => task.kind === 'edit') ?? props.tasks.find((task) => task.kind === 'create'))

const line = (e: Entry) => e.publishAt !== undefined
  ? t('site.drafts.goesLive', { date: whenWeekday(e.publishAt, props.timeZone, format) })
  : t('site.drafts.since', { date: whenWeekday(e.since ?? 0, props.timeZone, format) })

/** Entries whose publish is on its way, one per row. */
const busy = reactive(new Set<string>())
async function advance(e: Entry) {
  busy.add(e._id)
  try {
    await ops.publishEntry(e._id, e.lifeRev, { task: publishTask.value ? taskRef(props.brickKey, publishTask.value) : undefined, timeZone: props.timeZone, main: props.main })
  } catch (error) {
    show(opErrorOf(error).message, { tone: 'err' })
  } finally {
    busy.delete(e._id)
  }
}
</script>

<template>
  <div v-if="rows.length" class="grid gap-3" data-test="today-drafts">
    <ul class="m-0 list-none overflow-hidden rounded-xl border p-0">
      <li v-for="e in rows" :key="e._id" class="flex items-center gap-2 border-b px-4 py-3 last:border-b-0">
        <span class="grid min-w-0 flex-1 gap-0.5">
          <span class="font-medium [overflow-wrap:anywhere]">{{ titleOf(brick, e.data, main) }}</span>
          <span class="text-[13px] text-muted-foreground">{{ line(e) }}</span>
        </span>
        <Button type="button" variant="outline" size="sm" :disabled="busy.has(e._id)" :aria-label="`${review ? t('entry.publish.review') : t('entry.publish.go')}: ${titleOf(brick, e.data, main)}`" @click="advance(e)">{{ review ? t('entry.publish.review') : t('entry.publish.go') }}</Button>
      </li>
    </ul>
    <div v-if="more">
      <Button as-child variant="outline"><NuxtLink :to="`/s/${slug}/all/${brickKey}`">{{ t('site.drafts.all') }}</NuxtLink></Button>
    </div>
  </div>
</template>
