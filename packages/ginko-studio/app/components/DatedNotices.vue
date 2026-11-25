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

/** `lastFocus`: the id of the element (the entry's title) that takes the focus when a cancel leaves no notice. */
const props = defineProps<{ site: string; entry: string; brick: Brick; main: string; timeZone: string; currency: Currency; task?: string; lastFocus?: string }>()
const { t, format } = useI18n()
const ops = useOps(computed(() => props.site))
const { data } = useConvexQuery(api.datedChanges.list, () => ({ site: props.site, entry: props.entry, ...(props.task ? { task: props.task } : {}) }), { server: false })
const names = (keys: readonly string[]) => keys.map((k) => shownLabel((props.brick.fields[k]?.label ?? k) as LabelText, props.main)).join(', ')
const notices = computed(() => (data.value ?? []).map((c) => ({
  id: c.id,
  from: c.from,
  mayCancel: c.mayCancel,
  mayMove: c.mayMove,
  text: t(c.stopped ? 'dated.stopped' : 'dated.waiting', { day: ops.dayText(c.from), changes: changesText(props.brick.fields, c.fields, c.values as Data, props.main, { t, format, currency: props.currency }) }),
  since: !c.stopped && c.changedSince.length ? t('dated.changedSince', { fields: names(c.changedSince) }) : '',
})))

/** The one notice with a step open: the cancel question or the day field. */
const open = ref<{ id: string; step: 'cancel' | 'day' }>()
const day = ref('')
const error = ref('')
const busy = ref(false)
const focus = (id: string) => nextTick(() => document.getElementById(id)?.focus())
// Focus (E9): a step that opens takes it (the day field, or "Behalten", the answer that loses nothing); a step that
// closes gives it back to the button that opened it, and after it succeeded to the notice's first button.
function start(id: string, step: 'cancel' | 'day', from: string) {
  open.value = { id, step }
  day.value = from
  error.value = ''
  focus(step === 'day' ? `dated-day-${id}` : `dated-keep-${id}`)
}
function close() {
  const was = open.value
  open.value = undefined
  if (was) focus(`dated-${was.step}-${was.id}-open`)
}
async function run(work: () => Promise<void>, gone = false) {
  const id = open.value?.id
  busy.value = true
  error.value = ''
  try {
    await work()
    open.value = undefined
    // A cancelled change's notice goes (`gone`): then the first button of another notice, when there is one, else
    // `lastFocus` (H1).
    const next = () => document.querySelector<HTMLElement>(`[data-notice]:not([data-notice="${id}"]) button`) ?? (props.lastFocus ? document.getElementById(props.lastFocus) : null)
    nextTick(() => (gone ? next() : document.getElementById(`dated-day-${id}-open`))?.focus())
  } catch (e) {
    error.value = (e as OpError).message
    if (open.value?.step === 'day') focus(`dated-day-${open.value.id}`)
  } finally {
    busy.value = false
  }
}
const cancel = (id: string) => run(() => ops.cancelChange(id, props.task), true)
function move(id: string) {
  error.value = !day.value ? t('dated.dayRequired') : day.value <= todayIn(props.timeZone) ? messageOf({ key: 'errors.dayNotAhead' }) : ''
  if (error.value) return focus(`dated-day-${id}`)
  return run(() => ops.moveChange(id, day.value, props.task))
}
</script>

<template>
  <div v-if="notices.length" class="grid gap-2" data-test="dated-notices">
    <div v-for="n in notices" :key="n.id" class="grid gap-2 rounded-md bg-warning/10 px-3 py-2.5" role="status" :data-notice="n.id">
      <p class="font-semibold text-warning [overflow-wrap:anywhere]">{{ n.text }}</p>
      <p v-if="n.since" class="text-sm text-warning">{{ n.since }}</p>
      <template v-if="open?.id === n.id && open.step === 'cancel'">
        <p class="text-sm font-semibold" role="alert">{{ t('dated.cancelQuestion') }}</p>
        <div class="flex flex-wrap gap-2">
          <Button type="button" variant="destructive" size="sm" :disabled="busy" @click="cancel(n.id)">{{ t('dated.cancel') }}</Button>
          <Button :id="`dated-keep-${n.id}`" type="button" variant="outline" size="sm" @click="close">{{ t('dated.keep') }}</Button>
        </div>
      </template>
      <template v-else-if="open?.id === n.id && open.step === 'day'">
        <StartsOnField :id="`dated-day-${n.id}`" v-model="day" class="max-w-80" :time-zone="timeZone" :error="error" />
        <div class="flex flex-wrap gap-2">
          <Button type="button" size="sm" :disabled="busy" @click="move(n.id)">{{ t('dated.saveDay') }}</Button>
          <Button type="button" variant="ghost" size="sm" @click="close">{{ t('entry.cancel') }}</Button>
        </div>
      </template>
      <!-- Only the steps the server allows this person (G7). -->
      <div v-else-if="n.mayMove || n.mayCancel" class="flex flex-wrap gap-2">
        <Button v-if="n.mayMove" :id="`dated-day-${n.id}-open`" type="button" variant="outline" size="sm" @click="start(n.id, 'day', n.from)">{{ t('dated.changeDay') }}</Button>
        <Button v-if="n.mayCancel" :id="`dated-cancel-${n.id}-open`" type="button" variant="outline" size="sm" @click="start(n.id, 'cancel', n.from)">{{ t('dated.cancel') }}</Button>
      </div>
      <p v-if="open?.id === n.id && open.step === 'cancel' && error" class="text-sm font-medium text-destructive" role="alert">{{ error }}</p>
    </div>
  </div>
</template>
