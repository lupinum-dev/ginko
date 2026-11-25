<!-- The changes of an entry that wait for a later day (D125), one notice each (D131): the day and the values,
     the fields changed since it was planned (the planned value still wins on its day), and two steps. "Änderung
     aufheben" asks first, then takes the change out: the entry stays as it is and online (datedChanges.cancel, never
     unpublish). A draft shows them too: an entry taken offline keeps its changes, which go into the draft on their day
     (D126, E4). "Tag ändern" moves it to another day (datedChanges.setDay; a change that stopped on its day starts
     again). Neither can be undone, so the message after it offers no Rückgängig. An exception (slice 3) names both days;
     "Tage ändern" moves both while it waits and only its end while it holds, and a holding one ends with "Jetzt beenden"
     (asked first): the website shows the normal value again at once. A yearly one (slice 4) is removed for good with
     "Änderung aufheben", also while it holds; its question says it does not come back next year. -->
<script setup lang="ts">
import type { Brick, Currency, Label as LabelText } from '@lupinum/ginko'
import { todayIn } from '@lupinum/ginko/internal'
import { api } from '#convex/api'
import { Button } from '@studio/components/ui/button'
import { shownLabel } from '../utils/labels'
import { changesText, valuesText, type Data } from '../utils/content'
import { messageOf } from '../utils/messageOf'
import type { OpError } from '../composables/useOps'
import StartsOnField from './StartsOnField.vue'
import { datedLine, exceptionText, type DatedRow } from '../utils/datedLines'
import { earliestStart, exceptionProblem, latestYearlyUntil } from '../utils/datedDays'

/** `lastFocus`: the id of the element (the entry's title) that takes the focus when a cancel leaves no notice. */
const props = defineProps<{ site: string; entry: string; brick: Brick; main: string; timeZone: string; currency: Currency; task?: string; lastFocus?: string }>()
const { t, format } = useI18n()
const ops = useOps(computed(() => props.site))
const { data } = useConvexQuery(api.datedChanges.list, () => ({ site: props.site, entry: props.entry, ...(props.task ? { task: props.task } : {}) }), { server: false })
const names = (keys: readonly string[]) => keys.map((k) => shownLabel((props.brick.fields[k]?.label ?? k) as LabelText, props.main)).join(', ')
function textOf(c: NonNullable<typeof data.value>[number]) {
  const words = { t, format, currency: props.currency }
  const changes = changesText(props.brick.fields, c.fields, c.values as Data, props.main, words)
  if (c.until === undefined || c.stopped) return t(c.stopped ? 'dated.stopped' : 'dated.waiting', { day: ops.dayText(c.from), changes })
  const normal = c.holds && c.normal ? valuesText(props.brick.fields, c.fields, c.normal as Data, props.main, words) : undefined
  return exceptionText({ ...c, until: c.until }, changes, normal, words)
}
/** The changes that wait or hold, for the line under each notice (datedLines, as the task sheet shows it). */
const active = computed<DatedRow[]>(() => (data.value ?? []).filter((c) => !c.stopped).map((c) => ({ id: c.id, from: c.from, until: c.until, holds: c.holds === true, fields: c.fields, values: c.values as Data })))
const notices = computed(() => (data.value ?? []).map((c) => ({
  id: c.id,
  from: c.from,
  until: c.until,
  holds: c.holds === true,
  yearly: c.yearly === true,
  // A yearly change is removed for good, also while it holds: it has no "Jetzt beenden" (slice 4, decision 2).
  ends: c.holds === true && !c.yearly,
  question: c.yearly ? 'dated.cancelYearlyQuestion' as const : c.holds ? 'dated.endQuestion' as const : 'dated.cancelQuestion' as const,
  mayCancel: c.mayCancel,
  mayMove: c.mayMove,
  text: textOf(c),
  since: !c.stopped && c.changedSince.length ? t('dated.changedSince', { fields: names(c.changedSince) }) : '',
  line: c.stopped ? undefined : datedLine(active.value, active.value.find((r) => r.id === c.id)!, { t, format, currency: props.currency }),
})))
type Notice = (typeof notices.value)[number]

/** The one notice with a step open: the cancel question or the day fields. */
const open = ref<{ id: string; step: 'cancel' | 'day' }>()
const day = ref('')
const until = ref('')
const error = ref('')
/** The day field `error` belongs to (`dated-day-<id>` or `dated-until-<id>`), which also takes the focus. */
const errorAt = ref('')
function refuse(field: string, message: string) {
  error.value = message
  errorAt.value = field
  focus(field)
}
const busy = ref(false)
const focus = (id: string) => nextTick(() => document.getElementById(id)?.focus())
// Focus (E9): a step that opens takes it (the day field, or "Behalten", the answer that loses nothing); a step that
// closes gives it back to the button that opened it, and after it succeeded to the notice's first button.
function start(n: Notice, step: 'cancel' | 'day') {
  open.value = { id: n.id, step }
  day.value = n.from
  until.value = n.until ?? ''
  error.value = ''
  // A holding exception moves only its end: the end field takes the focus.
  focus(step === 'day' ? (n.holds ? `dated-until-${n.id}` : `dated-day-${n.id}`) : `dated-keep-${n.id}`)
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
    const n = notices.value.find((o) => o.id === open.value?.id)
    if (n && open.value?.step === 'day') refuse(n.until !== undefined ? `dated-until-${n.id}` : `dated-day-${n.id}`, (e as OpError).message)
    else error.value = (e as OpError).message
  } finally {
    busy.value = false
  }
}
const cancel = (id: string) => run(() => ops.cancelChange(id, props.task), true)
function move(n: Notice) {
  if (n.until !== undefined) return moveDays(n)
  const problem = !day.value ? t('dated.dayRequired') : day.value <= todayIn(props.timeZone) ? messageOf({ key: 'errors.dayNotAhead' }) : ''
  if (problem) return refuse(`dated-day-${n.id}`, problem)
  return run(() => ops.moveChange(n.id, day.value, props.task))
}
/**
 * "Tage speichern" of an exception: a waiting one takes both days, a holding one keeps its start (decision 4). The limits
 * are the task sheet's (utils/datedDays, round N6): a yearly one may start a year back and end before today unless it
 * holds. The server checks the same.
 */
function moveDays(n: Notice) {
  const from = n.holds ? n.from : day.value
  if (!from) return refuse(`dated-day-${n.id}`, t('dated.dayRequired'))
  if (!until.value) return refuse(`dated-until-${n.id}`, t('dated.dayRequired'))
  const problem = exceptionProblem({ from, until: until.value, today: todayIn(props.timeZone), yearly: n.yearly, holding: n.holds })
  const text = problem === 'startsTooFarBack' ? t('dated.startsTooFarBack') : problem === 'untilBeforeFrom' ? t('dated.untilBeforeFrom')
    : problem === 'yearlyTooLong' ? t('dated.yearlyTooLong') : problem === 'yearlyLeapDay' ? t('dated.yearlyLeapDay') : problem ? messageOf({ key: 'errors.dayBeforeToday' }) : ''
  if (problem) return refuse(problem === 'startsTooFarBack' || problem === 'startsPast' ? `dated-day-${n.id}` : `dated-until-${n.id}`, text)
  return run(() => ops.moveChange(n.id, from, props.task, until.value, n.yearly))
}
</script>

<template>
  <div v-if="notices.length" class="grid gap-2" data-test="dated-notices">
    <div v-for="n in notices" :key="n.id" class="grid gap-2 rounded-md bg-warning/10 px-3 py-2.5" role="status" :data-notice="n.id">
      <p class="font-semibold text-warning [overflow-wrap:anywhere]">{{ n.text }}</p>
      <p v-if="n.since" class="text-sm text-warning">{{ n.since }}</p>
      <p v-if="n.line" class="text-sm text-warning" :data-test="n.line.test">{{ n.line.text }}</p>
      <template v-if="open?.id === n.id && open.step === 'cancel'">
        <p class="text-sm font-semibold" role="alert">{{ t(n.question) }}</p>
        <div class="flex flex-wrap gap-2">
          <Button type="button" variant="destructive" size="sm" :disabled="busy" @click="cancel(n.id)">{{ t(n.ends ? 'dated.endNow' : 'dated.cancel') }}</Button>
          <Button :id="`dated-keep-${n.id}`" type="button" variant="outline" size="sm" @click="close">{{ t('dated.keep') }}</Button>
        </div>
      </template>
      <template v-else-if="open?.id === n.id && open.step === 'day'">
        <!-- A holding exception keeps its start (decision 4): only its end is asked. -->
        <StartsOnField v-if="!n.holds" :id="`dated-day-${n.id}`" v-model="day" class="max-w-80" :earliest="n.until !== undefined ? earliestStart(todayIn(timeZone), n.yearly) : undefined" :time-zone="timeZone" :error="errorAt === `dated-day-${n.id}` ? error : ''" />
        <StartsOnField v-if="n.until !== undefined" :id="`dated-until-${n.id}`" v-model="until" class="max-w-80" :label="t('dated.until')" :earliest="n.holds ? todayIn(timeZone) : day || earliestStart(todayIn(timeZone), n.yearly)" :latest="n.yearly ? latestYearlyUntil(n.holds ? n.from : day || todayIn(timeZone)) : undefined" :time-zone="timeZone" :error="errorAt === `dated-until-${n.id}` ? error : ''" />
        <div class="flex flex-wrap gap-2">
          <Button type="button" size="sm" :disabled="busy" @click="move(n)">{{ t(n.until !== undefined ? 'dated.saveDays' : 'dated.saveDay') }}</Button>
          <Button type="button" variant="ghost" size="sm" @click="close">{{ t('entry.cancel') }}</Button>
        </div>
      </template>
      <!-- Only the steps the server allows this person (G7). -->
      <div v-else-if="n.mayMove || n.mayCancel" class="flex flex-wrap gap-2">
        <Button v-if="n.mayMove" :id="`dated-day-${n.id}-open`" type="button" variant="outline" size="sm" @click="start(n, 'day')">{{ t(n.until !== undefined ? 'dated.changeDays' : 'dated.changeDay') }}</Button>
        <Button v-if="n.mayCancel" :id="`dated-cancel-${n.id}-open`" type="button" variant="outline" size="sm" @click="start(n, 'cancel')">{{ t(n.ends ? 'dated.endNow' : 'dated.cancel') }}</Button>
      </div>
      <p v-if="open?.id === n.id && open.step === 'cancel' && error" class="text-sm font-medium text-destructive" role="alert">{{ error }}</p>
    </div>
  </div>
</template>
