<!-- The task form (UI.md 3.1, 3.2): only the task's fields, prefilled by the server, saved with one
     opId per attempt. Conflicts keep the person's input and show the new state next to it. The person's own
     proposal on the entry (SPEC 17) is where an edit starts while it waits; a rejected one can be reopened. -->
<script setup lang="ts">
import { api } from '#convex/api'
import type { Brick, Json, Label as LabelText, Locale } from '@lupinum/ginko'
import { defaultsFor, isShown, weeklyTask, type Schema } from '@lupinum/ginko/internal'
import GinkoField from './fields/GinkoField.vue'
import EntryGoneBanner from './EntryGoneBanner.vue'
import LocalDraftOffer from './LocalDraftOffer.vue'
import ConflictPanel from './ConflictPanel.vue'
import ProposalWithdraw from './ProposalWithdraw.vue'
import { provideSiteRefs } from '../composables/useSiteRefs'
import { Button } from '@studio/components/ui/button'
import { XIcon } from '@lucide/vue'
import { PROBLEM, SHEET_DIALOG } from '../utils/sheetDialog'
import type { Entry } from '../composables/useSiteData'
import { formatDay, taskFields, taskRef, titleOf, weekShortcuts, type Data, type Task } from '../utils/content'
import { shownLabel } from '../utils/labels'
import { whenFull } from '../utils/when'
import { whoText } from '../utils/who'

const props = defineProps<{
  site: string
  brickKey: string
  brick: Brick
  task: Task
  /** The entry an `edit` task changes (singles: their one entry; pick tasks: the chosen one). */
  entry?: Entry
  main: Locale
  locales: readonly Locale[]
  /** The brick's remove task, so the person can undo a creation (staff need the grant). */
  removeTask?: Task
  /** Someone removed `entry` while the sheet was open (useKeptEntry): the input stays, the banner offers a way out. */
  removed?: boolean
  /** The person may restore a removed entry (owners, admins, staff with the remove task). */
  mayRestore?: boolean
  /** The titles of the brick's current entries, to point out a new one that already exists. */
  existing?: string[]
  /** The site's schema, so ref fields can list the entries they point to. */
  schema: Schema
  /** A create task that plans a week ahead: the entry the website shows this week, to start from ("Von dieser Woche übernehmen"). */
  copyFrom?: string
  /** Opened to fix this rejected own proposal ("Korrigieren"): the form starts from its values. */
  reopen?: string
}>()
const emit = defineEmits<{ close: [] }>()
const { t, format } = useI18n()
const shown = (label: LabelText) => shownLabel(label, props.main)

provideSiteRefs(() => props.site, () => props.schema, () => props.main)
const fields = computed(() => taskFields(props.brick, props.task))
const isCreate = computed(() => props.task.kind === 'create')
const ref_ = computed(() => taskRef(props.brickKey, props.task))
/** The weekly task ("Mittagsmenü dieser Woche") always covers this week: its week is shown, not asked (the server holds it to that). */
const fixedWeek = computed(() => {
  const weekly = weeklyTask(props.brick)
  return weekly?.task.id === props.task.id ? weekly.field : undefined
})
const dayText = (value: Json | undefined) => (typeof value === 'string' ? formatDay(value, format) : '–')

const form = useEntryForm({
  site: computed(() => props.site),
  brickKey: () => props.brickKey,
  brick: () => props.brick,
  fields: () => fields.value,
  // A create task makes a new entry even when one is passed.
  entry: () => (isCreate.value ? undefined : props.entry),
  main: () => props.main,
  // Schnell ändern edits translatable texts in the main language only (UI.md 3.1).
  locale: () => props.main,
  task: () => ref_.value,
  removeTask: () => (props.removeTask ? taskRef(props.brickKey, props.removeTask) : undefined),
  draft: () => !isCreate.value && props.entry?.state === 'draft',
  removed: () => !isCreate.value && !!props.removed,
})
const { draft, baseline, initial, ready, issues, problem, conflict, busy, offline, waiting, dirty, localOffer } = form
/** The form holds the values of an own proposal, not the stored ones. */
const fromProposal = ref(false)
/** The week an own proposal the form started from was made for, when it sent one (the weekly task keeps this week). */
const proposalWeek = ref<Json>()
/**
 * The weekly task opened on days of an older week: the stored ones, or those of an own proposal made in an older week
 * and still waiting. A rushed save would publish them as this week's.
 */
const oldWeek = computed(() => {
  const key = fixedWeek.value
  if (!key || !ready.value) return undefined
  const source = (fromProposal.value ? proposalWeek.value : undefined) ?? props.entry?.data[key]
  return typeof source === 'string' && source !== draft.value[key] ? source : undefined
})

// Prefill (SPEC 2.7): stored values of the task's fields, then the task's preset, resolved on the server.
const prefillArgs = computed(() => ({ site: props.site, task: ref_.value, ...(props.entry && !isCreate.value ? { entry: props.entry._id } : {}) }))
const { data: prefill, error: prefillError } = useConvexQuery(api.tasks.prefill, prefillArgs, { server: false })

// The person's own proposal on the entry through this task (proposals.ownFor): an open one is where the form starts,
// so sending again replaces it with what they see; a rejected one can be reopened to fix it.
const ownArgs = () => (props.entry && !isCreate.value ? { site: props.site, entry: props.entry._id } : 'skip' as const)
const { data: own, error: ownError } = useConvexQuery(api.proposals.ownFor, ownArgs, { server: false })
const mine = computed(() => (own.value && own.value.task === ref_.value ? own.value : null))
/** The proposal's values of this task's fields; the weekly task keeps this week. */
const proposedValues = (o: NonNullable<typeof mine.value>): Data =>
  Object.fromEntries(Object.entries(o.fields as Data).filter(([k]) => Object.hasOwn(fields.value, k) && k !== fixedWeek.value))
/** Starts the form from an own proposal's values over `start`. */
function loadProposal(start: Data, o: NonNullable<typeof mine.value>) {
  form.load({ ...start, ...proposedValues(o) })
  fromProposal.value = true
  proposalWeek.value = fixedWeek.value ? (o.fields as Data)[fixedWeek.value] : undefined
}

watch([prefill, own, ownError], ([p]) => {
  // Both answers first, so the form does not start on the stored values and jump; a failed proposal read does not hold it up.
  if (!p || ready.value || (ownArgs() !== 'skip' && own.value === undefined && !ownError.value)) return
  // A new entry starts from the schema defaults; choices without a default stay unset on purpose (UI.md 5).
  const start: Data = isCreate.value ? { ...defaultsFor(fields.value) } : {}
  const o = mine.value
  // An open proposal that no longer fits (someone changed its fields since) is not where the form starts: its banner says so.
  if (o && ((o.status === 'open' && o.fits) || o.proposal === props.reopen)) loadProposal({ ...start, ...(p as Data) }, o)
  else form.load({ ...start, ...(p as Data) })
}, { immediate: true })

// "Zurückziehen" (here or in Verlauf), a decision, or a change that makes it no longer fit ends the open proposal the
// untouched form shows: the form goes back to the stored values, so nothing suggests the old ones are on their way and
// Speichern does not send them again. Typed input stays.
const startable = (o: typeof mine.value) => o?.status === 'open' && o.fits
watch(mine, (now, before) => {
  if (!fromProposal.value || !startable(before) || startable(now) || dirty.value || !prefill.value) return
  form.load(prefill.value as Data)
  fromProposal.value = false
})
/**
 * The line of an open own proposal: it waits and Speichern replaces it; it no longer fits; or the input is back at the
 * stored values, so Speichern has nothing to send and only Zurückziehen drops it.
 */
const pendingText = computed(() => {
  const o = mine.value
  if (o?.status !== 'open') return ''
  const key = !o.fits ? 'entry.pendingStale' : form.changed.value.length ? 'entry.pending' : 'entry.pendingSame'
  return t(key, { when: whenFull(o.createdAt, props.schema.timeZone, format) })
})

/** "Deinen Vorschlag wieder öffnen": the rejected values, to fix what the approver asked for. */
function reopenOwn() {
  if (!mine.value || !prefill.value) return
  loadProposal(prefill.value as Data, mine.value)
}

// "Von dieser Woche übernehmen": a new planned week starts from this week's days and note, its own week stays. The
// copied values are the form's start, so a dish changed without its allergens asks "Noch richtig?" like an edit does.
const convex = useConvex()
const copying = ref(false)
const copied = ref(false)
async function copyThisWeek() {
  const plans = props.brick.kind === 'collection' ? props.brick.plans : undefined
  const weekly = plans && Object.hasOwn(props.schema.bricks, plans.brick) ? weeklyTask(props.schema.bricks[plans.brick]!) : undefined
  if (!props.copyFrom || !plans || !weekly || weekly.task.kind !== 'edit') return
  copying.value = true
  try {
    // Slim rows have no lists: the source is read whole.
    const source = await convex.query(api.entries.get, { site: props.site, entry: props.copyFrom })
    if (!source || source.deleted) return
    const keys = weekly.task.fields.filter((k) => k !== weekly.field && k !== plans.field && Object.hasOwn(fields.value, k))
    const week: Data = {}
    for (const k of keys) if (source.data[k] !== undefined) week[k] = source.data[k]
    form.load({ ...draft.value, ...week })
    copied.value = true
  } catch (e) {
    problem.value = opErrorOf(e).message
  } finally {
    copying.value = false
  }
}

/** A new entry with the same name as one that is already there (e.g. a second "Heute ausgebucht"). */
const twin = computed(() => {
  if (!isCreate.value || !props.existing?.length) return undefined
  const mine = titleOf(props.brick, draft.value, props.main).trim().toLowerCase()
  return props.existing.find((title) => title.trim().toLowerCase() === mine)
})

const confirmClose = ref(false)
const dialog = ref<HTMLDialogElement | null>(null)
onMounted(() => dialog.value?.showModal())
watch(issues, (list) => { if (list.length) nextTick(() => dialog.value?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()) })

// Closed while a save was still on its way (offline): the save goes on, and its outcome still reaches the person.
const { show } = useToast()
let leftWhileSaving = false
async function finish(ok: boolean) {
  if (leftWhileSaving) {
    if (!ok) show(problem.value ? t('entry.notSaved', { reason: problem.value }) : t('entry.notSavedReopen'), { tone: 'err' })
    return
  }
  // A proposal keeps the sheet open with the person's input and the waiting line; the toast already said where it went.
  if (ok && !dirty.value && !waiting.value) emit('close')
}
async function save() {
  // The save button is only aria-disabled (below), so a keyboard press still lands here.
  if (busy.value || !ready.value || removedHere.value) return
  if (form.blockers.size) nextTick(() => dialog.value?.querySelector<HTMLElement>('.check button')?.focus())
  await finish(await form.save())
}
async function keepMine() {
  await finish(await form.keepMine())
}
async function keepBoth() {
  await finish(await form.mergeLists())
}
// Someone removed the entry (N1): bring it back and save the input, or drop it.
const removedHere = computed(() => !isCreate.value && !!props.removed && !!props.entry)
async function restoreRemoved(lifeRev: number) {
  const typed = dirty.value
  const ok = await form.restoreAndSave(lifeRev, props.removeTask ? taskRef(props.brickKey, props.removeTask) : undefined)
  // Without input the sheet stays open on the restored entry; with input it closes like after Speichern.
  if (typed) await finish(ok)
}
function requestClose() {
  // A save on its way cannot be taken back by closing; say so instead of offering "Verwerfen" (break-it 9).
  if (busy.value) {
    leftWhileSaving = true
    show(t('entry.saveContinues'))
    emit('close')
    return
  }
  // A removed entry: the input stays on this device (the banner says so and has its own "Verwerfen").
  if (dirty.value && !confirmClose.value && !removedHere.value) {
    confirmClose.value = true
    return
  }
  emit('close')
}
/** "Verwerfen" (after "Änderungen verwerfen?", or on a removed entry): the input goes, and so does its local copy. */
function discardAndClose() {
  form.discard()
  emit('close')
}
function onCancel(event: Event) {
  event.preventDefault()
  requestClose()
}
</script>

<template>
  <dialog ref="dialog" :class="SHEET_DIALOG" aria-labelledby="sheet-title" @cancel="onCancel">
    <form class="grid h-[inherit] max-h-[inherit] grid-rows-[auto_1fr_auto]" novalidate @submit.prevent="save()">
      <header class="flex items-start justify-between gap-3 border-b bg-card pt-4 pb-3 pr-3 pl-5">
        <div>
          <h2 id="sheet-title" class="text-lg font-semibold">{{ shown(task.label) }}</h2>
          <p v-if="entry && brick.kind === 'collection'" class="mt-0.5 text-sm text-muted-foreground">{{ titleOf(brick, entry.data, main) }}</p>
        </div>
        <Button type="button" variant="ghost" size="icon" class="flex-none rounded-full" :aria-label="t('entry.close')" @click="requestClose">
          <XIcon aria-hidden="true" />
        </Button>
      </header>

      <div class="grid content-start gap-5 overflow-auto px-5 pt-[18px] pb-6">
        <p v-if="prefillError" :class="PROBLEM" role="alert">{{ opErrorOf(prefillError).message }}</p>
        <p v-else-if="!ready" class="text-muted-foreground">{{ t('entry.loading') }}</p>
        <template v-else>
          <EntryGoneBanner
            v-if="removedHere && entry"
            :site="site" :brick-key="brickKey" :entry="entry" :dirty="dirty" :busy="busy" :may-restore="!!mayRestore"
            @restore="restoreRemoved" @discard="discardAndClose"
          />
          <LocalDraftOffer v-if="localOffer" :saved-at="localOffer.savedAt" :busy="busy" @restore="form.restoreLocal()" @discard="form.dropLocal()" />
          <ConflictPanel
            v-if="conflict"
            :conflict="conflict" :draft="draft" :baseline="baseline" :fields="brick.fields" :locale="main" :main="main"
            :can-keep-both="!!form.listMerge.value"
            @keep-mine="keepMine" @take-theirs="form.takeTheirs()" @keep-both="keepBoth"
          />
          <div v-if="mine?.status === 'open'" class="flex flex-wrap items-center justify-between gap-x-3 rounded-md bg-warning/10 py-1 pr-1 pl-3" role="status" data-test="own-proposal">
            <p class="py-1.5 font-semibold text-warning">{{ pendingText }}</p>
            <ProposalWithdraw :proposal="mine.proposal" />
          </div>
          <div v-else-if="mine?.status === 'rejected'" class="grid gap-2 rounded-md bg-warning/10 px-3 py-2.5" data-test="own-proposal">
            <p class="font-semibold text-warning [overflow-wrap:anywhere]">{{ t('history.rejectedBy', { who: mine.decidedBy ? whoText(mine.decidedBy, t) : t('who.member'), reason: mine.reason ?? '' }) }}</p>
            <Button v-if="!fromProposal && !dirty" type="button" variant="outline" size="sm" class="justify-self-start" @click="reopenOwn">{{ t('entry.reopenProposal') }}</Button>
          </div>
          <p v-if="problem" :class="PROBLEM" role="alert">{{ problem }}</p>
          <p v-if="twin" class="rounded-md bg-warning/10 px-3 py-2.5 font-semibold text-warning">{{ t('entry.twin', { title: twin }) }}</p>
          <p v-if="oldWeek" class="rounded-md bg-warning/10 px-3 py-2.5 font-semibold text-warning">{{ t('entry.oldWeek', { date: formatDay(oldWeek, format) }) }}</p>
          <!-- Like "Deinen Vorschlag wieder öffnen" above, it replaces the form's values: offered only before anything is typed. -->
          <Button v-if="isCreate && copyFrom && !copied && !dirty" type="button" variant="outline" class="justify-self-start" :disabled="copying" @click="copyThisWeek">{{ t('entry.copyThisWeek') }}</Button>
          <template v-for="(field, key) in fields" :key="key">
            <div v-if="key === fixedWeek" class="grid gap-1" data-slot="field" data-test="fixed-week">
              <p class="text-sm font-medium">{{ shown(field.label) }}</p>
              <p class="font-semibold">{{ dayText(draft[key]) }}</p>
              <p class="text-sm text-muted-foreground">{{ t('entry.weekFixed') }}</p>
            </div>
            <GinkoField
              v-else
              v-show="isShown(field, draft)"
              :field="field"
              :model-value="draft[key]"
              :baseline="isCreate ? initial[key] : baseline[key]"
              :weeks="weekShortcuts(brick, String(key))"
              :path="String(key)"
              :locale="main"
              :locales="locales"
              :issues="issues"
              @update:model-value="form.setField(String(key), $event)"
            />
          </template>
        </template>
      </div>

      <footer class="flex flex-wrap items-center gap-2 border-t bg-card px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
        <p v-if="waiting && !dirty && !confirmClose && mine?.status !== 'open'" class="basis-full font-medium text-warning" role="status">{{ t('history.waiting') }}</p>
        <template v-if="confirmClose">
          <p class="basis-full font-semibold" role="alert">{{ t('entry.discard.question') }}</p>
          <Button type="button" variant="destructive" @click="discardAndClose">{{ t('entry.discard.confirm') }}</Button>
          <Button type="button" variant="outline" @click="confirmClose = false">{{ t('entry.discard.keepEditing') }}</Button>
        </template>
        <template v-else>
          <!-- aria-disabled, not disabled: a disabled button cannot keep the focus, so a keyboard save would drop it to the page top. -->
          <Button type="submit" class="flex-1" :aria-disabled="busy || !ready || removedHere ? 'true' : undefined">{{ busy ? (offline ? t('entry.save.waiting') : t('entry.save.saving')) : t('entry.save.save') }}</Button>
          <Button type="button" variant="ghost" @click="requestClose">{{ t('entry.cancel') }}</Button>
        </template>
      </footer>
    </form>
  </dialog>
</template>
