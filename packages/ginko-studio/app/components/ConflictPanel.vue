<!-- Someone saved fields the person is editing (UI.md 3.2): their value next to the person's input, and the
     choice of one version. A list says row by row what each side added, removed or changed ("Du hast „…“
     hinzugefügt", "anna@… hat „…“ entfernt"), and when no row was changed by both, "Beides behalten" saves
     both. Used by Alles bearbeiten and Schnell ändern. -->
<script setup lang="ts">
import type { Fields, Json, Locale } from '@lupinum/ginko'
import { mergeRows, rowDiffs } from '@lupinum/ginko/internal'
import { Button } from '@studio/components/ui/button'
import { displayValue, rowTitle, type Data } from '../utils/content'
import { shownLabel } from '../utils/labels'
import { whoText, type Who } from '../utils/who'

const props = defineProps<{
  conflict: { fields: string[]; data: Data; by?: Record<string, Who> }
  draft: Data
  /** The stored values the person started from: the base both sides changed. */
  baseline: Data
  fields: Fields
  /** The language of the values; labels are in `main`. */
  locale: Locale
  main: Locale
  /** "Beides behalten" is possible (useEntryForm.listMerge). */
  canKeepBoth: boolean
}>()
const emit = defineEmits<{ keepMine: []; takeTheirs: []; keepBoth: [] }>()
const { t, format } = useI18n()

const shownField = (key: string) => (props.fields[key] ? shownLabel(props.fields[key]!.label, props.main) : key)
const whoOf = (key: string) => {
  const who = props.conflict.by?.[key]
  return who ? whoText(who, t) : t('entry.conflict.someone')
}

/** A row by its first text column, else "Zeile n" by its place in the first of `lists` that holds it. */
function rowName(key: string, id: string, ...lists: (Json | undefined)[]): string {
  const field = props.fields[key]
  for (const list of lists) {
    const rows = (Array.isArray(list) ? list : []).filter((r): r is Record<string, Json> => typeof r === 'object' && r !== null && !Array.isArray(r))
    // A row without `_id` is `#<index>` (rowDiffs).
    const at = id.startsWith('#') ? Number(id.slice(1)) : rows.findIndex((r) => r._id === id)
    const row = rows[at]
    if (!row) continue
    const named = field?.type === 'list' ? rowTitle(field.of, row, props.locale, { t, format })?.text : undefined
    return named || t('entry.conflict.row.untitled', { n: at + 1 })
  }
  return id
}

const YOU = { added: 'entry.conflict.row.youAdded', removed: 'entry.conflict.row.youRemoved', changed: 'entry.conflict.row.youChanged' } as const
const THEY = { added: 'entry.conflict.row.theyAdded', removed: 'entry.conflict.row.theyRemoved', changed: 'entry.conflict.row.theyChanged' } as const

/** One line per field; a list instead gets one line per row each side changed, and one per row both changed. */
const items = computed(() => props.conflict.fields.map((key) => {
  const field = props.fields[key]
  const stored = props.conflict.data[key]
  const mine = props.draft[key]
  if (field?.type === 'list') {
    const base = props.baseline[key]
    const { clashes } = mergeRows(base, mine, stored)
    const lines = [
      ...rowDiffs(base, mine).rows.filter((r) => !clashes.includes(r.id)).map((r) => t(YOU[r.change], { row: rowName(key, r.id, r.change === 'removed' ? base : mine) })),
      ...rowDiffs(base, stored).rows.filter((r) => !clashes.includes(r.id)).map((r) => t(THEY[r.change], { who: whoOf(key), row: rowName(key, r.id, r.change === 'removed' ? base : stored) })),
      ...clashes.map((id) => t('entry.conflict.row.clash', { row: rowName(key, id, stored, mine, base) })),
    ]
    if (lines.length) return { key, label: shownField(key), lines }
  }
  const words = { t, format }
  return { key, label: shownField(key), text: t('entry.conflict.item', { field: shownField(key), stored: field ? displayValue(field, stored, props.locale, words) : '', mine: field ? displayValue(field, mine, props.locale, words) : '' }) }
}))
</script>

<template>
  <div class="grid gap-2 rounded-md bg-warning/10 p-3" role="alert">
    <p><strong>{{ t('entry.conflict.changed', { fields: conflict.fields.map(shownField).join(', ') || t('entry.conflict.thisEntry') }) }}</strong></p>
    <ul class="m-0 list-disc pl-[18px]">
      <li v-for="item in items" :key="item.key">
        <template v-if="item.lines">
          {{ item.label }}
          <ul class="m-0 list-disc pl-[18px]">
            <li v-for="(line, i) in item.lines" :key="i">{{ line }}</li>
          </ul>
        </template>
        <template v-else>{{ item.text }}</template>
      </li>
    </ul>
    <div class="flex flex-wrap gap-2">
      <Button v-if="canKeepBoth" type="button" @click="emit('keepBoth')">{{ t('entry.conflict.keepBoth') }}</Button>
      <Button type="button" :variant="canKeepBoth ? 'outline' : 'default'" @click="emit('keepMine')">{{ t('entry.conflict.keepMine') }}</Button>
      <Button type="button" variant="outline" @click="emit('takeTheirs')">{{ t('entry.conflict.takeTheirs') }}</Button>
    </div>
  </div>
</template>
