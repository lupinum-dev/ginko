<!-- The changes of an entry that wait for a later day (D125), one notice each (D131): the day and the values,
     the fields changed since it was planned (the planned value still wins on its day), and two steps. "Änderung
     aufheben" asks first, then takes the change out: the entry stays as it is and online (datedChanges.cancel, never
     unpublish). A draft shows them too: an entry taken offline keeps its changes, which go into the draft on their day
     (D126, E4). "Tag ändern" moves it to another day (datedChanges.setDay; a change that stopped on its day starts
     again). Neither can be undone, so the message after it offers no Rückgängig. -->
<script setup lang="ts">
import type { Brick, Currency, Label as LabelText } from '@lupinum/ginko'
import { todayIn } from '@lupinum/ginko/internal'
import { api } from '#convex/api'
import { Button } from '@studio/components/ui/button'
import { shownLabel } from '../utils/labels'
import { changesText, type Data } from '../utils/content'
import { messageOf } from '../utils/messageOf'
import type { OpError } from '../composables/useOps'
import StartsOnField from './StartsOnField.vue'

const props = defineProps<{ site: string; entry: string; brick: Brick; main: string; timeZone: string; currency: Currency; task?: string }>()
const { t, format } = useI18n()
const ops = useOps(computed(() => props.site))
const { data } = useConvexQuery(api.datedChanges.list, () => ({ site: props.site, entry: props.entry }), { server: false })
const names = (keys: readonly string[]) => keys.map((k) => shownLabel((props.brick.fields[k]?.label ?? k) as LabelText, props.main)).join(', ')
const notices = computed(() => (data.value ?? []).map((c) => ({
  id: c.id,
  from: c.from,
  text: t(c.stopped ? 'dated.stopped' : 'dated.waiting', { day: ops.dayText(c.from), changes: changesText(props.brick.fields, c.fields, c.values as Data, props.main, { t, format, currency: props.currency }) }),
  since: !c.stopped && c.changedSince.length ? t('dated.changedSince', { fields: names(c.changedSince) }) : '',
})))

/** The one notice with a step open: the cancel question or the day field. */
const open = ref<{ id: string; step: 'cancel' | 'day' }>()
const day = ref('')
const error = ref('')
const busy = ref(false)
function start(id: string, step: 'cancel' | 'day', from: string) {
  open.value = { id, step }
  day.value = from
  error.value = ''
  if (step === 'day') nextTick(() => document.getElementById(`dated-day-${id}`)?.focus())
}
async function run(work: () => Promise<void>) {
  busy.value = true
  error.value = ''
  try {
    await work()
    open.value = undefined
  } catch (e) {
    error.value = (e as OpError).message
  } finally {
    busy.value = false
  }
}
const cancel = (id: string) => run(() => ops.cancelChange(id, props.task))
function move(id: string) {
  if (!day.value) return (error.value = t('dated.dayRequired'))
  if (day.value <= todayIn(props.timeZone)) return (error.value = messageOf({ key: 'errors.dayNotAhead' }))
  return run(() => ops.moveChange(id, day.value, props.task))
}
</script>

<template>
  <div v-if="notices.length" class="grid gap-2" data-test="dated-notices">
    <div v-for="n in notices" :key="n.id" class="grid gap-2 rounded-md bg-warning/10 px-3 py-2.5" role="status">
      <p class="font-semibold text-warning [overflow-wrap:anywhere]">{{ n.text }}</p>
      <p v-if="n.since" class="text-sm text-warning">{{ n.since }}</p>
      <template v-if="open?.id === n.id && open.step === 'cancel'">
        <p class="text-sm font-semibold" role="alert">{{ t('dated.cancelQuestion') }}</p>
        <div class="flex flex-wrap gap-2">
          <Button type="button" variant="destructive" size="sm" :disabled="busy" @click="cancel(n.id)">{{ t('dated.cancel') }}</Button>
          <Button type="button" variant="outline" size="sm" @click="open = undefined">{{ t('dated.keep') }}</Button>
        </div>
      </template>
      <template v-else-if="open?.id === n.id && open.step === 'day'">
        <StartsOnField :id="`dated-day-${n.id}`" v-model="day" class="max-w-80" :time-zone="timeZone" />
        <div class="flex flex-wrap gap-2">
          <Button type="button" size="sm" :disabled="busy" @click="move(n.id)">{{ t('dated.saveDay') }}</Button>
          <Button type="button" variant="ghost" size="sm" @click="open = undefined">{{ t('entry.cancel') }}</Button>
        </div>
      </template>
      <div v-else class="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" @click="start(n.id, 'day', n.from)">{{ t('dated.changeDay') }}</Button>
        <Button type="button" variant="outline" size="sm" @click="start(n.id, 'cancel', n.from)">{{ t('dated.cancel') }}</Button>
      </div>
      <p v-if="open?.id === n.id && error" class="text-sm font-medium text-destructive" role="alert">{{ error }}</p>
    </div>
  </div>
</template>
