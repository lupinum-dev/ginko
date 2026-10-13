<!-- One page of the change log (UI.md 7). Each page is its own live query, so an undo on an older
     page updates its row at once. Rückgängig shows only on saves that are not undone yet, and for
     staff only when one of their granted edit tasks covers every field of the change. -->
<script setup lang="ts">
import { api } from '#convex/api'
import type { Schema } from '@lupinum/ginko/internal'
import { useTextOf } from '../composables/useTextOf'
import { byText } from '../utils/who'
import { Badge } from '@studio/components/ui/badge'
import { Button } from '@studio/components/ui/button'

const props = defineProps<{
  site: string
  cursor: string | undefined
  schema: Schema
  manager: boolean
  grants: ReadonlySet<string>
  /** History filter (UI.md 10.5): `entry` is the list of that entry (see `entry`). */
  filter?: 'all' | 'mine' | 'ai' | 'entry'
  entry?: string
}>()
const emit = defineEmits<{ next: [cursor: string | null] }>()
const { t, format } = useI18n()

const by = (): 'me' | 'ai' | undefined => (props.filter === 'mine' ? 'me' : props.filter === 'ai' ? 'ai' : undefined)
const page = useConvexQuery(api.changes.list, () => ({ site: props.site, cursor: props.cursor, entry: props.filter === 'entry' ? props.entry : undefined, by: by() }))
const ops = useOps(computed(() => props.site))

type Change = NonNullable<typeof page.data.value>['page'][number]

const rows = computed<Change[]>(() => page.data.value?.page ?? [])

// The cursor of the next older page; null once this page is the end of the list.
watchEffect(() => {
  if (page.data.value) emit('next', page.data.value.isDone ? null : page.data.value.continueCursor)
})

const now = ref(Date.now())
let timer: ReturnType<typeof setInterval> | undefined
onMounted(() => { timer = setInterval(() => { now.value = Date.now() }, 60_000) })
onUnmounted(() => clearInterval(timer))

/** "just now", "5 min ago", "2 h ago", then the date and time in the site's time zone. */
function when(at: number): string {
  const diff = now.value - at
  if (diff < 60_000) return t('entry.changes.justNow')
  if (diff < 3_600_000) return t('entry.changes.minutesAgo', { count: Math.floor(diff / 60_000) })
  if (diff < 86_400_000) return t('entry.changes.hoursAgo', { count: Math.floor(diff / 3_600_000) })
  return format.date(at, { timeZone: props.schema.timeZone, day: 'numeric', month: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

/** The line in the Studio's language, dates in the site's zone; rows from before `msg` show their German sentence. */
const textOf = useTextOf(() => ({ timeZone: props.schema.timeZone, main: props.schema.locales[0] }))
const sentenceOf = (change: Change) => textOf(change.msg, change.sentence)

/** Who made the change, and the AI key when one did. */
const actorName = (change: Change) => byText(change.who, change.via, change.agent, t)

/** The edit task a staff member needs to undo this save: one granted task that covers all its fields. Owners and admins need none. */
function taskFor(change: Change): string | undefined {
  if (props.manager) return undefined
  const fields = change.fields ?? []
  const brick = props.schema.bricks[change.brick]
  const found = brick?.tasks?.find((task) => task.kind === 'edit'
    && props.grants.has(`${change.brick}.${task.id}`)
    && fields.every((field) => task.fields.includes(field)))
  return found ? `${change.brick}.${found.id}` : undefined
}

function canUndo(change: Change): boolean {
  return change.kind === 'save' && !change.undoneBy && (props.manager || taskFor(change) !== undefined)
}

/** A save of an entry can be shown field by field and, as a normal new save, be gone back to. */
const showing = ref(new Set<string>())
function toggleShow(id: string) {
  const next = new Set(showing.value)
  if (!next.delete(id)) next.add(id)
  showing.value = next
}
const confirming = ref<string | null>(null)
const canRevert = (change: Change) => change.kind === 'save' && !!change.entry && (props.manager || taskFor(change) !== undefined)
const fullDate = (at: number) => format.date(at, { timeZone: props.schema.timeZone, day: 'numeric', month: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })
async function revert(change: Change) {
  busy.value = change._id
  try {
    await ops.revertEntry(change.entry!, change._id, taskFor(change))
    confirming.value = null
  } finally {
    busy.value = null
  }
}

const busy = ref<string | null>(null)
async function undo(change: Change) {
  busy.value = change._id
  try {
    await ops.undoChange(change._id, taskFor(change))
  } finally {
    busy.value = null
  }
}
</script>

<template>
  <div class="mb-3 last:mb-0">
    <p v-if="page.error.value" class="font-semibold text-destructive" role="alert">{{ opErrorOf(page.error.value).message }}</p>
    <ol v-if="rows.length" class="m-0 list-none overflow-hidden rounded-xl border p-0">
      <li v-for="change in rows" :key="change._id" class="grid gap-2 border-b px-4 py-3 last:border-b-0">
        <div class="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <div class="grid min-w-0 gap-0.5">
            <p class="font-medium">{{ sentenceOf(change) }}</p>
            <p class="text-[13px] text-muted-foreground">{{ actorName(change) }} · {{ when(change.at) }}</p>
          </div>
          <div class="flex flex-wrap items-center gap-2">
            <Badge v-if="change.undoneBy" variant="soft">{{ t('entry.changes.undone') }}</Badge>
            <Button
              v-if="!change.undoneBy && canUndo(change)"
              type="button"
              variant="secondary"
              size="sm"
              :disabled="busy === change._id"
              @click="undo(change)"
            >{{ t('entry.changes.undo') }}</Button>
            <Button
              v-if="change.fields?.length"
              type="button"
              variant="ghost" size="sm"
              :aria-expanded="showing.has(change._id)"
              @click="toggleShow(change._id)"
            >{{ showing.has(change._id) ? t('history.hideChanges') : t('history.showChanges') }}</Button>
            <Button
              v-if="canRevert(change) && confirming !== change._id"
              type="button"
              variant="secondary" size="sm"
              @click="confirming = change._id"
            >{{ t('history.revert') }}</Button>
          </div>
        </div>
        <div v-if="confirming === change._id" class="grid gap-2" role="group" :aria-label="t('history.revert')">
          <p>{{ t('history.revertConfirm', { date: fullDate(change.at) }) }}</p>
          <div class="flex flex-wrap gap-2">
            <Button type="button" size="sm" :disabled="busy === change._id" @click="revert(change)">{{ t('history.revert') }}</Button>
            <Button type="button" variant="ghost" size="sm" @click="confirming = null">{{ t('entry.cancel') }}</Button>
          </div>
        </div>
        <ChangeDetail v-if="showing.has(change._id)" :site="site" :change="change._id" :brick="change.brick" :schema="schema" />
      </li>
    </ol>
    <p v-else-if="!cursor && page.status.value === 'success'" class="py-6 text-muted-foreground">{{ filter && filter !== 'all' ? t('history.noMatches') : t('entry.changes.empty') }}</p>
  </div>
</template>
