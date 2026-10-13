<!-- The task form (UI.md 3.1, 3.2): only the task's fields, prefilled by the server, saved with one
     opId per attempt. Conflicts keep the person's input and show the new state next to it. -->
<script setup lang="ts">
import { api } from '#convex/api'
import type { Brick, Label as LabelText, Locale } from '@lupinum/ginko'
import { defaultsFor, isShown, type Schema } from '@lupinum/ginko/internal'
import GinkoField from './fields/GinkoField.vue'
import { provideRefs } from './fields/refs'
import { Button } from '@studio/components/ui/button'
import { XIcon } from '@lucide/vue'
import { PROBLEM, SHEET_DIALOG } from '../utils/sheetDialog'
import type { Entry } from '../composables/useSiteData'
import { displayValue, taskFields, taskRef, titleOf, type Data, type Task } from '../utils/content'
import { shownLabel } from '../utils/labels'

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
  /** The brick's current entries, to point out a new one that already exists. */
  existing?: Entry[]
  /** The whole site, so ref fields can list the entries they point to. */
  schema?: Schema
  entries?: Entry[]
}>()
const emit = defineEmits<{ close: [] }>()
const { t, format } = useI18n()
const shown = (label: LabelText) => shownLabel(label, props.main)
const shownField = (key: string) => (props.brick.fields[key] ? shown(props.brick.fields[key]!.label) : key)

provideRefs(() => props.schema ?? { bricks: {} } as unknown as Schema, () => props.entries ?? [], () => props.main)
const fields = computed(() => taskFields(props.brick, props.task))
const isCreate = computed(() => props.task.kind === 'create')
const ref_ = computed(() => taskRef(props.brickKey, props.task))
/** Date fields the task presets to a week start get week shortcuts. */
const weekFields = computed(() => new Set(Object.entries(('prefill' in props.task ? props.task.prefill : undefined) ?? {}).filter(([, v]) => v === '@workWeek' || v === '@nextWorkWeek').map(([k]) => k)))

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
})
const { draft, baseline, ready, issues, problem, conflict, busy, slow, waiting, dirty } = form

// Prefill (SPEC 2.7): stored values of the task's fields, then the task's preset, resolved on the server.
const prefillArgs = computed(() => ({ site: props.site, task: ref_.value, ...(props.entry && !isCreate.value ? { entry: props.entry._id } : {}) }))
const { data: prefill, error: prefillError } = useConvexQuery(api.tasks.prefill, prefillArgs, { server: false })
watch(prefill, (p) => {
  if (!p || ready.value) return
  // A new entry starts from the schema defaults; choices without a default stay unset on purpose (UI.md 5).
  const start: Data = isCreate.value ? { ...defaultsFor(fields.value) } : {}
  form.load({ ...start, ...(p as Data) })
}, { immediate: true })

/** A new entry with the same name as one that is already there (e.g. a second "Heute ausgebucht"). */
const twin = computed(() => {
  if (!isCreate.value || !props.existing?.length) return undefined
  const mine = titleOf(props.brick, draft.value, props.main).trim().toLowerCase()
  return props.existing.find((e) => titleOf(props.brick, e.data, props.main).trim().toLowerCase() === mine)
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
  if (busy.value || !ready.value) return
  if (form.blockers.size) nextTick(() => dialog.value?.querySelector<HTMLElement>('.check button')?.focus())
  await finish(await form.save())
}
async function keepMine() {
  await finish(await form.keepMine())
}
function requestClose() {
  // A save on its way cannot be taken back by closing; say so instead of offering "Verwerfen" (break-it 9).
  if (busy.value) {
    leftWhileSaving = true
    show(t('entry.saveContinues'))
    emit('close')
    return
  }
  if (dirty.value && !confirmClose.value) {
    confirmClose.value = true
    return
  }
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
          <div v-if="conflict" class="grid gap-2 rounded-md bg-warning/10 p-3" role="alert">
            <p><strong>{{ t('entry.conflict.changed', { fields: conflict.fields.map((k) => shownField(k)).join(', ') || t('entry.conflict.thisEntry') }) }}</strong></p>
            <ul class="list-disc pl-[18px]">
              <li v-for="k in conflict.fields" :key="k">{{ t('entry.conflict.item', { field: shownField(k), stored: displayValue(brick.fields[k]!, conflict.data[k], main, { t, format }), mine: displayValue(brick.fields[k]!, draft[k], main, { t, format }) }) }}</li>
            </ul>
            <div class="flex flex-wrap gap-2">
              <Button type="button" @click="keepMine">{{ t('entry.conflict.keepMine') }}</Button>
              <Button type="button" variant="outline" @click="form.takeTheirs()">{{ t('entry.conflict.takeTheirs') }}</Button>
            </div>
          </div>
          <p v-if="problem" :class="PROBLEM" role="alert">{{ problem }}</p>
          <p v-if="twin" class="rounded-md bg-warning/10 px-3 py-2.5 font-semibold text-warning">{{ t('entry.twin', { title: titleOf(brick, twin.data, main) }) }}</p>
          <GinkoField
            v-for="(field, key) in fields"
            v-show="isShown(field, draft)"
            :key="key"
            :field="field"
            :model-value="draft[key]"
            :baseline="baseline[key]"
            :weeks="weekFields.has(String(key))"
            :path="String(key)"
            :locale="main"
            :locales="locales"
            :issues="issues"
            @update:model-value="form.setField(String(key), $event)"
          />
        </template>
      </div>

      <footer class="flex flex-wrap items-center gap-2 border-t bg-card px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
        <p v-if="waiting && !dirty && !confirmClose" class="basis-full font-medium text-warning" role="status">{{ t('history.waiting') }}</p>
        <template v-if="confirmClose">
          <p class="basis-full font-semibold" role="alert">{{ t('entry.discard.question') }}</p>
          <Button type="button" variant="destructive" @click="emit('close')">{{ t('entry.discard.confirm') }}</Button>
          <Button type="button" variant="outline" @click="confirmClose = false">{{ t('entry.discard.keepEditing') }}</Button>
        </template>
        <template v-else>
          <!-- aria-disabled, not disabled: a disabled button cannot keep the focus, so a keyboard save would drop it to the page top. -->
          <Button type="submit" class="flex-1" :aria-disabled="busy || !ready ? 'true' : undefined">{{ busy ? (slow ? t('entry.save.waiting') : t('entry.save.saving')) : t('entry.save.save') }}</Button>
          <Button type="button" variant="ghost" @click="requestClose">{{ t('entry.cancel') }}</Button>
        </template>
      </footer>
    </form>
  </dialog>
</template>
