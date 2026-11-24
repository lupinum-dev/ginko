<!-- A rows field (`f.rows`) as row cards, with the look of a list's cards: one card per row, the row's name as its
     heading (the weekday in the Studio's language, or the row's own label), its columns inside. The rows are fixed by
     the field, so there is no add, remove or move. When a text in a row changed but its choices (with `askAgainWhen`)
     did not, the choices must be confirmed ("Noch richtig?"). In a foreign language only the columns to translate show. -->
<script setup lang="ts">
import { computed, inject, onBeforeUnmount, ref, watchEffect, type Ref } from 'vue'
import { useI18n } from '#imports'
import type { Field, Json, Locale } from '@lupinum/ginko'
import { DAY_KEYS, isShown, ordered, rowKeysOf, type SiteWeek } from '@lupinum/ginko/internal'
import { hasTranslation, rowLabel } from '../../utils/content'
import GinkoField from './GinkoField.vue'
import { messageOf } from '@studio/utils/messageOf'
import { BLOCKERS, issuesUnder, type Issue, textIn } from '@lupinum/ginko-editor'
import { Button } from '@studio/components/ui/button'
import { useStudioSite } from '../../utils/labels'
import { useStillRight } from '../../composables/useStillRight'

type Row = Record<string, Json>
type RowsField = Extract<Field, { type: 'rows' }>

const props = defineProps<{
  id: string
  field: RowsField
  modelValue: Json | undefined
  baseline?: Json
  path: string
  locale: Locale
  locales: readonly Locale[]
  issues: readonly Issue[]
}>()
const emit = defineEmits<{ 'update:modelValue': [value: Json | undefined] }>()
const blockers = inject(BLOCKERS, undefined)
const siteWeek = inject<Ref<SiteWeek | undefined>>('ginko:site-week', ref(undefined))
const { shown: labelText } = useStudioSite()
const { t, format } = useI18n()

const isRow = (value: unknown): value is Row => !!value && typeof value === 'object' && !Array.isArray(value)
const value = computed<Record<string, Json>>(() => (isRow(props.modelValue) ? props.modelValue : {}))
/**
 * The rows in the order of the field: the site's week for days (stored maps come back with their keys sorted). Outside
 * a site's pages there is no week; the days then show Monday first, as many as the value has.
 */
const keys = computed(() => (typeof props.field.rows !== 'string' || siteWeek.value ? rowKeysOf(props.field, siteWeek.value) : DAY_KEYS.filter((key) => Object.hasOwn(value.value, key))))
const rowOf = (key: string): Row => { const row = value.value[key]; return isRow(row) ? row : {} }
const titleOf = (key: string) => rowLabel(props.field, key, props.locale, { t, format })

const live = computed(() => ordered(props.field.of).filter(([, f]) => !f.retired))
const main = computed(() => props.locales[0] ?? props.locale)
const foreign = computed(() => props.locale !== main.value)
/** The columns shown: in a foreign language only those with text to translate. */
const columns = computed(() => (foreign.value ? live.value.filter(([, f]) => hasTranslation(f)) : live.value))

/** A column with `showWhen` shows only while the row's other value matches; the stored value stays. */
const shown = (row: Row, sub: Field) => isShown(sub, row)

function setCell(key: string, column: string, cell: Json | undefined) {
  const row: Row = { ...rowOf(key) }
  if (cell === undefined) delete row[column]
  else row[column] = cell
  emit('update:modelValue', { ...value.value, [key]: row })
}

// "Noch richtig?": as in a list (GinkoFieldList), a choices column with `askAgainWhen` next to its changed text column.
const before = computed<Record<string, Json>>(() => (isRow(props.baseline) ? props.baseline : {}))
const checkKeys = computed(() => live.value.filter(([, f]) => f.type === 'choices' && f.askAgainWhen !== undefined).map(([k]) => k))
const textKeys = computed(() => live.value.filter(([, f]) => f.type === 'text' || f.type === 'longtext').map(([k]) => k))
const stillRight = useStillRight()
const askedKey = (column: string) => { const f = props.field.of[column]; return f?.type === 'choices' ? f.askAgainWhen : undefined }
const confirmKey = (key: string, column: string) => `${props.path}.${key}.${column}`
const askedText = (row: Row, column: string) => textIn(row[askedKey(column)!], main.value)
function needsCheck(key: string, column: string): boolean {
  if (!checkKeys.value.includes(column)) return false
  const row = rowOf(key)
  const old = before.value[key]
  return stillRight.asks(confirmKey(key, column), { text: askedText(row, column), choice: row[column] }, isRow(old) ? { text: askedText(old, column), choice: old[column] } : undefined)
}
const changedLabel = (column: string) => labelText(props.field.of[askedKey(column)!]!.label)
function confirm(key: string, column: string) { stillRight.confirm(confirmKey(key, column), askedText(rowOf(key), column)) }
watchEffect(() => {
  if (!blockers) return
  for (const k of [...blockers.keys()]) if (k.startsWith(`${props.path}.`)) blockers.delete(k)
  for (const key of keys.value) {
    for (const column of checkKeys.value) {
      if (needsCheck(key, column)) blockers.set(confirmKey(key, column), t('fields.list.confirmBlocker', { title: titleOf(key), label: labelText(props.field.of[column]!.label) }))
    }
  }
})
onBeforeUnmount(() => { if (blockers) for (const k of [...blockers.keys()]) if (k.startsWith(`${props.path}.`)) blockers.delete(k) })

/**
 * A text cell that still holds its start text (the field's default for the row, else the column's default, such as
 * "Wird noch bekannt gegeben") is selected on focus, so typing replaces it. The start text stays a value: the site
 * shows it for days not known yet.
 */
function startText(key: string, column: string): Json | undefined {
  const given = isRow(props.field.default) ? props.field.default[key] : undefined
  return isRow(given) && given[column] !== undefined ? given[column] : props.field.of[column]?.default as Json | undefined
}
const keepSelection = ref(false)
function selectPlaceholder(key: string, column: string, event: FocusEvent) {
  const input = event.target
  const start = startText(key, column)
  if (!(input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement) || !textKeys.value.includes(column) || start === undefined) return
  if (!input.value || textIn(rowOf(key)[column], props.locale) !== textIn(start, props.locale)) return
  input.setSelectionRange(0, input.value.length)
  keepSelection.value = true
}
/** The mouse button going up after a click into the cell would put the caret there and drop the selection. */
function holdSelection(event: MouseEvent) {
  if (keepSelection.value) event.preventDefault()
  keepSelection.value = false
}

const rowIssues = (key: string) => issuesUnder(props.issues, `${props.path}.${key}`).filter((i) => i.path === `${props.path}.${key}`)
const fieldIssues = computed(() => props.issues.filter((i) => i.path === props.path))
</script>

<template>
  <div class="grid gap-3" role="group" :aria-labelledby="`${id}-label`">
    <p v-for="e in fieldIssues" :key="e.message" class="text-sm font-medium text-destructive" role="alert">{{ messageOf(e) }}</p>
    <ol class="m-0 grid list-none gap-3 p-0">
      <li v-for="key in keys" :key="key" class="grid gap-4 rounded-lg border bg-card p-3 sm:p-4" :data-row="key">
        <h3 class="m-0 truncate text-sm font-semibold">{{ titleOf(key) }}</h3>
        <p v-for="e in rowIssues(key)" :key="e.message" class="text-sm font-medium text-destructive" role="alert">{{ messageOf(e) }}</p>
        <div class="grid gap-4">
          <template v-for="[column, sub] in columns" :key="column">
            <div v-if="shown(rowOf(key), sub)" :class="{ 'rounded-md bg-warning/10 p-3': needsCheck(key, column) }" @focusin="selectPlaceholder(key, column, $event)" @mouseup="holdSelection" @focusout="keepSelection = false">
              <GinkoField :field="sub" :model-value="rowOf(key)[column]" :path="`${path}.${key}.${column}`" :locale="locale" :locales="locales" :issues="issues" @update:model-value="setCell(key, column, $event)" />
              <div v-if="needsCheck(key, column)" class="check mt-2 flex flex-wrap items-center gap-2 text-sm font-semibold text-warning">
                <p>{{ t('fields.list.changed', { changed: changedLabel(column), label: labelText(sub.label) }) }}</p>
                <Button type="button" variant="outline" size="sm" @click="confirm(key, column)">{{ t('fields.list.confirm') }}</Button>
              </div>
            </div>
          </template>
        </div>
      </li>
    </ol>
  </div>
</template>
