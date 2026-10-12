<!-- A list as row cards (UI.md 5). Fixed lists (min = max with a unique choice column, e.g. the
     weekdays) show that column as the row title and allow no add/remove/move. When a text in a row
     changed but its required choices did not, the choices must be confirmed ("Noch richtig?"). -->
<script setup lang="ts">
import { computed, inject, onBeforeUnmount, reactive, watchEffect } from 'vue'
import { useI18n } from '#imports'
import { defaultsFor, isShown, ordered, stableJson, type Field, type Json, type Locale } from '@lupinum/ginko'
import GinkoField from './GinkoField.vue'
import { messageOf } from '@studio/utils/messageOf'
import { BLOCKERS, issuesUnder, type Issue, newRowId, textIn } from '@lupinum/ginko-editor'
import { ArrowDownIcon, ArrowUpIcon, PlusIcon, Trash2Icon } from '@lucide/vue'
import { Button } from '@studio/components/ui/button'
import { useToast } from '../../composables/useToast'
import { useStudioSite } from '../../utils/labels'

type Row = Record<string, Json> & { _id: string }

const props = defineProps<{
  id: string
  field: Extract<Field, { type: 'list' }>
  modelValue: Json | undefined
  baseline?: Json
  path: string
  locale: Locale
  locales: readonly Locale[]
  issues: readonly Issue[]
}>()
const emit = defineEmits<{ 'update:modelValue': [value: Json | undefined] }>()
const blockers = inject(BLOCKERS, undefined)
const { shown: labelText } = useStudioSite()
const { t } = useI18n()

const rows = computed(() => (Array.isArray(props.modelValue) ? (props.modelValue as Row[]) : []))
const max = computed(() => props.field.max ?? 50)
const min = computed(() => props.field.min ?? 0)
const fixed = computed(() => min.value === max.value)
const uniqueKey = computed(() => props.field.unique)
const uniqueField = computed(() => (uniqueKey.value ? props.field.of[uniqueKey.value] : undefined))
/** In a fixed list the unique choice names the row and is not edited. */
const titleKey = computed(() => (fixed.value && uniqueField.value?.type === 'choice' ? uniqueKey.value : undefined))
const columns = computed(() => ordered(props.field.of).filter(([k, f]) => k !== titleKey.value && !f.retired))

function rowTitle(row: Row, index: number): string {
  if (titleKey.value && uniqueField.value?.type === 'choice') {
    const label = uniqueField.value.options.find((o) => o.value === row[titleKey.value!])?.label
    return label === undefined ? `${labelText(props.field.itemLabel)} ${index + 1}` : labelText(label)
  }
  // Any other row is named by its first text, so "Betriebsurlaub" is found without opening anything.
  for (const [key, sub] of ordered(props.field.of)) {
    if (sub.retired || (sub.type !== 'text' && sub.type !== 'longtext')) continue
    const text = (textIn(row[key], props.locale) || textIn(row[key], props.locales[0]!)).trim()
    if (text) return text
  }
  return `${labelText(props.field.itemLabel)} ${index + 1}`
}

/** A column with `showWhen` shows only while the row's other value matches; the stored value stays. */
const shown = (row: Row, sub: Field) => isShown(sub, row)

function update(next: Row[]) { emit('update:modelValue', next) }
function setCell(index: number, key: string, value: Json | undefined) {
  const next = rows.value.map((r) => ({ ...r }))
  if (value === undefined) delete next[index]![key]
  else next[index]![key] = value
  update(next)
}
function move(index: number, by: -1 | 1) {
  const next = [...rows.value]
  const [row] = next.splice(index, 1)
  next.splice(index + by, 0, row!)
  update(next)
}
/** Removing needs no question: the row comes back with "Rückgängig", at the same position. */
function removeRow(index: number) {
  const row = rows.value[index]
  if (!row) return
  const title = rowTitle(row, index)
  update(rows.value.filter((_, i) => i !== index))
  useToast().show(t('fields.list.removed', { title }), { action: { label: t('fields.list.undo'), run: () => restoreRow(row, index) } })
}
function restoreRow(row: Row, index: number) {
  if (rows.value.some((r) => r._id === row._id)) return
  const next = [...rows.value]
  next.splice(Math.min(index, next.length), 0, row)
  update(next)
}
function addRow() { update([...rows.value, { ...defaultsFor(props.field.of), _id: newRowId() } as Row]) }

// "Noch richtig?": a required choices column next to a changed text column.
const before = computed(() => new Map((Array.isArray(props.baseline) ? (props.baseline as Row[]) : []).map((r) => [r._id, r])))
const checkKeys = computed(() => columns.value.filter(([, f]) => f.type === 'choices' && !f.optional).map(([k]) => k))
const textKeys = computed(() => columns.value.filter(([, f]) => f.type === 'text' || f.type === 'longtext').map(([k]) => k))
/** Confirmations hold the texts that were reviewed; a later change of the text asks again (Astra phase 8). */
const confirmed = reactive(new Map<string, string>())
const textsOf = (row: Row) => textKeys.value.map((k) => textIn(row[k], props.locale)).join('\u0000')
function needsCheck(row: Row, key: string): boolean {
  if (!checkKeys.value.includes(key)) return false
  const old = before.value.get(row._id)
  if (!old || confirmed.get(`${row._id}.${key}`) === textsOf(row)) return false
  const textChanged = textKeys.value.some((k) => textIn(row[k], props.locale) !== textIn(old[k], props.locale))
  return textChanged && stableJson(row[key] ?? null) === stableJson(old[key] ?? null)
}
function changedLabel(row: Row): string {
  const old = before.value.get(row._id)
  const key = textKeys.value.find((k) => old && textIn(row[k], props.locale) !== textIn(old[k], props.locale))
  return key ? labelText(props.field.of[key]!.label) : t('fields.list.text')
}
function confirm(row: Row, key: string) { confirmed.set(`${row._id}.${key}`, textsOf(row)) }
watchEffect(() => {
  if (!blockers) return
  for (const k of [...blockers.keys()]) if (k.startsWith(`${props.path}.`)) blockers.delete(k)
  for (const row of rows.value) {
    for (const key of checkKeys.value) {
      if (needsCheck(row, key)) blockers.set(`${props.path}.${row._id}.${key}`, t('fields.list.confirmBlocker', { title: rowTitle(row, rows.value.indexOf(row)), label: labelText(props.field.of[key]!.label) }))
    }
  }
})
onBeforeUnmount(() => { if (blockers) for (const k of [...blockers.keys()]) if (k.startsWith(`${props.path}.`)) blockers.delete(k) })

const rowIssues = (row: Row) => issuesUnder(props.issues, `${props.path}.${row._id}`).filter((i) => i.path === `${props.path}.${row._id}`)
const listIssues = computed(() => props.issues.filter((i) => i.path === props.path))
</script>

<template>
  <div class="grid gap-3" role="group" :aria-labelledby="`${id}-label`">
    <p v-for="e in listIssues" :key="e.message" class="text-sm font-medium text-destructive" role="alert">{{ messageOf(e) }}</p>
    <ol v-if="rows.length" class="m-0 grid list-none gap-3 p-0">
      <li v-for="(row, index) in rows" :key="row._id" class="grid gap-4 rounded-md border bg-card p-3 sm:p-4" :data-row="row._id">
        <div class="flex items-center justify-between gap-2">
          <h4 class="m-0 min-w-0 flex-1 truncate text-sm font-semibold">{{ rowTitle(row, index) }}</h4>
          <div v-if="!fixed" class="-my-1 -mr-2 flex shrink-0">
            <Button type="button" variant="ghost" size="icon" :disabled="index === 0" :aria-label="t('fields.list.up', { title: rowTitle(row, index) })" @click="move(index, -1)"><ArrowUpIcon aria-hidden="true" /></Button>
            <Button type="button" variant="ghost" size="icon" :disabled="index === rows.length - 1" :aria-label="t('fields.list.down', { title: rowTitle(row, index) })" @click="move(index, 1)"><ArrowDownIcon aria-hidden="true" /></Button>
            <Button type="button" variant="ghost" size="icon" class="hover:text-destructive" :disabled="rows.length <= min" :aria-label="t('fields.list.remove', { title: rowTitle(row, index) })" @click="removeRow(index)"><Trash2Icon aria-hidden="true" /></Button>
          </div>
        </div>
        <p v-for="e in rowIssues(row)" :key="e.message" class="text-sm font-medium text-destructive" role="alert">{{ messageOf(e) }}</p>
        <div class="grid gap-4">
          <template v-for="[key, sub] in columns" :key="key">
            <div v-if="shown(row, sub)" :class="{ 'rounded-md bg-warning/10 p-3': needsCheck(row, key) }">
              <GinkoField :field="sub" :model-value="row[key]" :path="`${path}.${row._id}.${key}`" :locale="locale" :locales="locales" :issues="issues" @update:model-value="setCell(index, key, $event)" />
              <div v-if="needsCheck(row, key)" class="check mt-2 flex flex-wrap items-center gap-2 text-sm font-semibold text-warning">
                <p>{{ t('fields.list.changed', { changed: changedLabel(row), label: labelText(sub.label) }) }}</p>
                <Button type="button" variant="outline" size="sm" @click="confirm(row, key)">{{ t('fields.list.confirm') }}</Button>
              </div>
            </div>
          </template>
        </div>
      </li>
    </ol>
    <Button v-if="!fixed && rows.length < max" type="button" variant="outline" class="justify-self-start" @click="addRow"><PlusIcon aria-hidden="true" />{{ t('fields.list.add', { item: labelText(field.itemLabel) }) }}</Button>
  </div>
</template>
