<!-- A list as row cards (UI.md 5). Fixed lists (min = max with a unique choice column, e.g. the
     weekdays) show that column as the row title and allow no add/remove/move. When a text in a row
     changed but its choices (with `askAgainWhen`) did not, the choices must be confirmed ("Noch richtig?").
     In a foreign language the list shows only the columns to translate: rows are added, removed and
     moved in the main language, where a new row gets its required texts.
     A list of photos only (a gallery) is a grid of photo tiles in the main language; a row with a photo and texts shows
     the photo small in its head. The description hint is printed once for the whole list. -->
<script setup lang="ts">
import { computed, inject, nextTick, onBeforeUnmount, provide, reactive, ref, watchEffect } from 'vue'
import { useI18n } from '#imports'
import type { Field, Json, Locale } from '@lupinum/ginko'
import { defaultsFor, isShown, ordered } from '@lupinum/ginko/internal'
import { hasTranslation } from '../../utils/content'
import GinkoField from './GinkoField.vue'
import GinkoFieldImage, { LIST_ALT_HINT } from './GinkoFieldImage.vue'
import { messageOf } from '@studio/utils/messageOf'
import { BLOCKERS, GINKO_ASSETS, TRANSLATION, issuesUnder, ownIssues, type Issue, newRowId, textIn } from '@lupinum/ginko-editor'
import { ArrowDownIcon, ArrowLeftIcon, ArrowRightIcon, ArrowUpIcon, EllipsisIcon, PlusIcon, Trash2Icon } from '@lucide/vue'
import { Button } from '@studio/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@studio/components/ui/dropdown-menu'
import { useToast } from '../../composables/useToast'
import { useStudioSite } from '../../utils/labels'
import { useStillRight } from '../../composables/useStillRight'

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
const translation = inject(TRANSLATION, undefined)
// The rows belong to the main language: a row added on another language's tab could get neither its main-language
// texts nor its pictures there, so it could never be saved. So rows are added, removed and moved only in the main language.
const foreignTab = computed(() => !!translation && props.locale !== props.locales[0])
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
const live = computed(() => ordered(props.field.of).filter(([k, f]) => k !== titleKey.value && !f.retired))
const main = computed(() => props.locales[0] ?? props.locale)
const foreign = computed(() => props.locale !== main.value)
/** The columns shown: in a foreign language only those with text to translate. */
const columns = computed(() => (foreign.value ? live.value.filter(([, f]) => hasTranslation(f)) : live.value))

/** The first photo column: its alt text names a row without text, its picture shows in the row head. */
const imageKey = computed(() => columns.value.find(([, f]) => f.type === 'image')?.[0])
/** Only photos (a gallery): tiles in a grid. In another language the rows stay cards, with the translation view of each description. */
const photoGrid = computed(() => !foreign.value && columns.value.length === 1 && !!imageKey.value)
const photoOf = (row: Row) => {
  const v = imageKey.value ? row[imageKey.value] : undefined
  return v && typeof v === 'object' && !Array.isArray(v) ? v : undefined
}
const assets = inject(GINKO_ASSETS, undefined)
const photoIds = computed(() => rows.value.flatMap((row) => { const file = photoOf(row)?.file; return typeof file === 'string' ? [file] : [] }))
const photos = assets ? assets.details(photoIds) : ref(undefined)
/** The small picture in the head of a row that also has texts. */
const thumbOf = (row: Row) => {
  const file = photoOf(row)?.file
  return !photoGrid.value && typeof file === 'string' ? photos.value?.[file]?.url : undefined
}
/** The photo column's own hint: the tiles have no field frame to print it, so the list prints it once. */
const columnHint = computed(() => { const hint = imageKey.value ? props.field.of[imageKey.value]?.hint : undefined; return hint === undefined ? undefined : labelText(hint) })
const hintId = computed(() => `${props.id}-alt-hint`)
// The rows' photos point their description to the one hint below the list.
if (imageKey.value) provide(LIST_ALT_HINT, hintId.value)
/** The id GinkoField gives a cell (`f-` and its path): the tiles keep it, so the description is `#…-alt` as in a row card. */
const cellId = (row: Row, key: string) => `f-${`${props.path}.${row._id}.${key}`.replace(/[^a-zA-Z0-9_-]/g, '-')}`
const cellErrors = (row: Row, key: string) => ownIssues(props.issues, `${props.path}.${row._id}.${key}`, props.locales)
const tileErrors = (row: Row) => [...rowIssues(row), ...cellErrors(row, imageKey.value!)]

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
  // A photo row is named by its description ("Gastgarten im Sommer"), not "Bild 3".
  const alt = photoOf(row)?.alt
  const described = (textIn(alt, props.locale) || textIn(alt, props.locales[0]!)).trim()
  if (described) return described
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
const root = ref<HTMLElement>()
/** Removing needs no question: the row comes back with "Rückgängig", at the same position. */
function removeRow(index: number) {
  const row = rows.value[index]
  if (!row) return
  const title = rowTitle(row, index)
  update(rows.value.filter((_, i) => i !== index))
  useToast().show(t('fields.list.removed', { title }), { action: { label: t('fields.list.undo'), run: () => restoreRow(row, index) } })
  // The pressed button went with its row: the focus moves to the remove button now in its place (the previous row's
  // after the last row), or to the add button when there is none to press, never to <body>.
  nextTick(() => {
    const buttons = root.value?.querySelectorAll<HTMLButtonElement>('[data-remove]') ?? []
    const next = buttons[Math.min(index, buttons.length - 1)]
    ;(next && !next.disabled ? next : root.value?.querySelector<HTMLElement>('[data-add]'))?.focus()
  })
}
function restoreRow(row: Row, index: number) {
  if (rows.value.some((r) => r._id === row._id)) return
  const next = [...rows.value]
  next.splice(Math.min(index, next.length), 0, row)
  update(next)
}
function addRow() { update([...rows.value, { ...defaultsFor(props.field.of), _id: newRowId() } as Row]) }

// "Noch richtig?": a choices column with `askAgainWhen` next to its changed text column. Only a change in the main
// language asks: a translation does not change the dish. In a foreign language the choices are not shown, so the
// question waits there until the main language shows again (the sheet switches back on Speichern).
const before = computed(() => new Map((Array.isArray(props.baseline) ? (props.baseline as Row[]) : []).map((r) => [r._id, r])))
const checkKeys = computed(() => live.value.filter(([, f]) => f.type === 'choices' && f.askAgainWhen !== undefined).map(([k]) => k))
const textKeys = computed(() => live.value.filter(([, f]) => f.type === 'text' || f.type === 'longtext').map(([k]) => k))
const stillRight = useStillRight()
/** The text column a choices column asks again about. */
const askedKey = (key: string) => { const f = props.field.of[key]; return f?.type === 'choices' ? f.askAgainWhen : undefined }
const confirmKey = (row: Row, key: string) => `${props.path}.${row._id}.${key}`
const askedText = (row: Row, key: string) => textIn(row[askedKey(key)!], main.value)
function needsCheck(row: Row, key: string): boolean {
  if (!checkKeys.value.includes(key)) return false
  const old = before.value.get(row._id)
  return stillRight.asks(confirmKey(row, key), { text: askedText(row, key), choice: row[key] }, old && { text: askedText(old, key), choice: old[key] })
}
function changedLabel(key: string): string {
  return labelText(props.field.of[askedKey(key)!]!.label)
}
function confirm(row: Row, key: string) { stillRight.confirm(confirmKey(row, key), askedText(row, key)) }
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

/**
 * A text cell that still holds the text of the list default's row (the placeholder "Wird noch bekannt gegeben") is
 * selected on focus, so typing replaces it. The placeholder stays a value: the site shows it for days not known yet.
 */
const defaultRows = computed(() => new Map((Array.isArray(props.field.default) ? (props.field.default as Row[]) : []).map((r) => [r._id, r])))
const keepSelection = ref(false)
function selectPlaceholder(row: Row, key: string, event: FocusEvent) {
  const input = event.target
  const start = defaultRows.value.get(row._id)?.[key]
  if (!(input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement) || !textKeys.value.includes(key) || start === undefined) return
  if (!input.value || textIn(row[key], props.locale) !== textIn(start, props.locale)) return
  input.setSelectionRange(0, input.value.length)
  keepSelection.value = true
}
/** The mouse button going up after a click into the cell would put the caret there and drop the selection. */
function holdSelection(event: MouseEvent) {
  if (keepSelection.value) event.preventDefault()
  keepSelection.value = false
}

// A gallery's tiles, for the touch menu: it offers the tile's own "other photo" and "from the library".
const tiles = new Map<string, InstanceType<typeof GinkoFieldImage>>()
const tileRef = (id: string) => (el: unknown) => {
  if (el) tiles.set(id, el as InstanceType<typeof GinkoFieldImage>)
  else tiles.delete(id)
}

const rowIssues = (row: Row) => issuesUnder(props.issues, `${props.path}.${row._id}`).filter((i) => i.path === `${props.path}.${row._id}`)
const listIssues = computed(() => props.issues.filter((i) => i.path === props.path))
</script>

<template>
  <div ref="root" class="grid gap-3" role="group" :aria-labelledby="`${id}-label`">
    <p v-for="e in listIssues" :key="e.message" class="text-sm font-medium text-destructive" role="alert">{{ messageOf(e) }}</p>

    <!-- A gallery: one tile per photo, its description below, its moves on hover and focus (always on touch). -->
    <div v-if="photoGrid" class="@container">
      <ol class="m-0 grid list-none grid-cols-2 items-start gap-3 p-0 @min-[34rem]:grid-cols-3 @min-[56rem]:grid-cols-4">
        <!-- data-path/type/label: the same hooks GinkoField's frame sets, so the live preview finds the photo being edited. -->
        <li
          v-for="(row, index) in rows" :key="row._id" class="group/tile relative grid min-w-0 gap-1" :data-row="row._id"
          :data-path="`${path}.${row._id}.${imageKey}`" data-type="image" :data-label="labelText(field.of[imageKey!]!.label)"
        >
          <h3 :id="`${cellId(row, imageKey!)}-label`" class="sr-only">{{ rowTitle(row, index) }}</h3>
          <GinkoFieldImage
            :ref="tileRef(row._id)"
            :id="cellId(row, imageKey!)" tile :field="field.of[imageKey!]!" :model-value="row[imageKey!]" :locale="locale" :invalid="cellErrors(row, imageKey!).length > 0"
            :described-by="tileErrors(row).length ? `${cellId(row, imageKey!)}-err` : undefined"
            @update:model-value="setCell(index, imageKey!, $event)"
          />
          <div v-if="tileErrors(row).length" :id="`${cellId(row, imageKey!)}-err`" class="grid gap-1">
            <p v-for="e in tileErrors(row)" :key="e.message" class="text-[13px] font-medium text-destructive" role="alert">{{ messageOf(e) }}</p>
          </div>
          <div
            v-if="!fixed" class="absolute top-1.5 right-1.5 flex gap-0.5 rounded-md bg-background/90 opacity-0 shadow-sm backdrop-blur-sm transition-opacity group-hover/tile:opacity-100 group-focus-within/tile:opacity-100 pointer-coarse:hidden"
          >
            <Button type="button" variant="ghost" size="icon-sm" :disabled="index === 0" :aria-label="t('fields.list.moveEarlier', { title: rowTitle(row, index) })" @click="move(index, -1)"><ArrowLeftIcon aria-hidden="true" /></Button>
            <Button type="button" variant="ghost" size="icon-sm" :disabled="index === rows.length - 1" :aria-label="t('fields.list.moveLater', { title: rowTitle(row, index) })" @click="move(index, 1)"><ArrowRightIcon aria-hidden="true" /></Button>
            <Button type="button" variant="ghost" size="icon-sm" class="hover:text-destructive" data-remove :disabled="rows.length <= min" :aria-label="t('fields.list.remove', { title: rowTitle(row, index) })" @click="removeRow(index)"><Trash2Icon aria-hidden="true" /></Button>
          </div>
          <!-- Touch: one menu instead of five buttons on the photo, so the photo stays visible. -->
          <DropdownMenu v-if="!fixed">
            <DropdownMenuTrigger as-child>
              <Button
                type="button" variant="secondary" size="icon" class="absolute top-1.5 right-1.5 hidden size-11 bg-background/90 shadow-sm backdrop-blur-sm pointer-coarse:inline-flex"
                :aria-label="t('fields.list.photoMenu', { title: rowTitle(row, index) })"
              ><EllipsisIcon aria-hidden="true" /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <template v-if="typeof photoOf(row)?.file === 'string'">
                <DropdownMenuItem class="min-h-11" @select="tiles.get(row._id)?.pick()">{{ t('fields.image.other') }}</DropdownMenuItem>
                <DropdownMenuItem class="min-h-11" @select="tiles.get(row._id)?.openLibrary()">{{ t('files.picker.choose') }}</DropdownMenuItem>
                <DropdownMenuSeparator />
              </template>
              <DropdownMenuItem class="min-h-11" :disabled="index === 0" @select="move(index, -1)">{{ t('fields.list.earlier') }}</DropdownMenuItem>
              <DropdownMenuItem class="min-h-11" :disabled="index === rows.length - 1" @select="move(index, 1)">{{ t('fields.list.later') }}</DropdownMenuItem>
              <DropdownMenuItem class="min-h-11" variant="destructive" :disabled="rows.length <= min" @select="removeRow(index)">{{ t('fields.remove') }}</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </li>
        <li v-if="!fixed && rows.length < max">
          <button
            type="button" data-add
            class="flex aspect-[4/3] w-full cursor-pointer flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed text-sm font-medium text-muted-foreground transition-colors outline-none hover:bg-foreground/[0.03] hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/80"
            @click="addRow"
          >
            <PlusIcon class="size-5" aria-hidden="true" />{{ t('fields.list.add', { item: labelText(field.itemLabel) }) }}
          </button>
        </li>
      </ol>
    </div>

    <ol v-else-if="rows.length" class="m-0 grid list-none gap-3 p-0">
      <li v-for="(row, index) in rows" :key="row._id" class="grid gap-4 rounded-lg border bg-card p-3 sm:p-4" :data-row="row._id">
        <!-- A grid, not a flex row: a flex row counts the whole one-line title into its narrowest width, so a long
             title ("Betriebsurlaub – ab 18. November …") widened every form around it and the sheet scrolled sideways. -->
        <div class="grid items-center gap-3" :class="thumbOf(row) ? 'grid-cols-[auto_minmax(0,1fr)_auto]' : 'grid-cols-[minmax(0,1fr)_auto]'">
          <img v-if="thumbOf(row)" :src="thumbOf(row)" alt="" class="size-12 rounded-md border object-cover">
          <h3 class="m-0 truncate text-sm font-semibold">{{ rowTitle(row, index) }}</h3>
          <div v-if="!fixed && !foreign" class="-my-1 -mr-2 flex shrink-0">
            <Button type="button" variant="ghost" size="icon" :disabled="index === 0" :aria-label="t('fields.list.up', { title: rowTitle(row, index) })" @click="move(index, -1)"><ArrowUpIcon aria-hidden="true" /></Button>
            <Button type="button" variant="ghost" size="icon" :disabled="index === rows.length - 1" :aria-label="t('fields.list.down', { title: rowTitle(row, index) })" @click="move(index, 1)"><ArrowDownIcon aria-hidden="true" /></Button>
            <Button type="button" variant="ghost" size="icon" class="hover:text-destructive" data-remove :disabled="rows.length <= min" :aria-label="t('fields.list.remove', { title: rowTitle(row, index) })" @click="removeRow(index)"><Trash2Icon aria-hidden="true" /></Button>
          </div>
        </div>
        <p v-for="e in rowIssues(row)" :key="e.message" class="text-sm font-medium text-destructive" role="alert">{{ messageOf(e) }}</p>
        <div class="grid gap-4">
          <template v-for="[key, sub] in columns" :key="key">
            <div v-if="shown(row, sub)" :class="{ 'rounded-md bg-warning/10 p-3': needsCheck(row, key) }" @focusin="selectPlaceholder(row, key, $event)" @mouseup="holdSelection" @focusout="keepSelection = false">
              <GinkoField :field="sub" :model-value="row[key]" :path="`${path}.${row._id}.${key}`" :locale="locale" :locales="locales" :issues="issues" @update:model-value="setCell(index, key, $event)" />
              <div v-if="needsCheck(row, key)" class="check mt-2 flex flex-wrap items-center gap-2 text-sm font-semibold text-warning">
                <p>{{ t('fields.list.changed', { changed: changedLabel(key), label: labelText(sub.label) }) }}</p>
                <Button type="button" variant="outline" size="sm" @click="confirm(row, key)">{{ t('fields.list.confirm') }}</Button>
              </div>
            </div>
          </template>
        </div>
      </li>
    </ol>
    <p v-if="imageKey && rows.length" :id="hintId" class="text-[13px] text-muted-foreground">{{ t('fields.list.photoHint') }}</p>
    <p v-if="photoGrid && columnHint && rows.length" class="text-[13px] text-muted-foreground">{{ columnHint }}</p>
    <template v-if="!fixed && rows.length < max && !photoGrid">
      <p v-if="foreignTab" class="text-sm text-muted-foreground">{{ t('fields.list.addInMain', { name: translation!.mainName() }) }}</p>
      <Button v-else-if="!foreign" type="button" variant="outline" class="justify-self-start" data-add @click="addRow"><PlusIcon aria-hidden="true" />{{ t('fields.list.add', { item: labelText(field.itemLabel) }) }}</Button>
    </template>
  </div>
</template>
