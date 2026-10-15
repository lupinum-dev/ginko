<!-- What a change did, field by field (UI.md 10.5): "Before" and "After" in the words of the list
     (displayValue). Long text shows only the changed paragraphs, with a visible − / + in front so the
     change does not depend on colour. Shared by History and Review. -->
<script setup lang="ts">
import { useI18n } from '#imports'
import type { Fields, Json, Locale } from '@lupinum/ginko'
import { isShown, ordered } from '@lupinum/ginko/internal'
import { computed } from 'vue'
import { displayValue, rowTitle } from '../utils/content'
import { paragraphDiff } from '../utils/paragraphDiff'
import { useStudioSite } from '../utils/labels'
import type { DiffField } from '../utils/review'

const props = defineProps<{ diff: readonly DiffField[]; fields?: Fields; locale: Locale }>()
const { t, format } = useI18n()
const { shown } = useStudioSite()

interface Unit { tag?: string; before: Json | null; after: Json | null }

const LONG = new Set(['longtext', 'markdown'])

const items = computed(() => props.diff.map((d) => {
  const units: Unit[] = d.locales ? d.locales.map((l) => ({ tag: l.locale.toUpperCase(), before: l.before, after: l.after })) : [{ before: d.before, after: d.after }]
  return { d, units: d.locales && d.locales.length === 1 && d.locales[0]!.locale === props.locale ? units.map((u) => ({ ...u, tag: undefined })) : units }
}))

/** A value like in the list; a field the schema no longer has shows plain text, or "changed" for anything bigger. */
function show(d: DiffField, value: Json | null): string {
  const field = props.fields && Object.hasOwn(props.fields, d.field) ? props.fields[d.field] : undefined
  if (field) return displayValue(field, value, props.locale, { t, format })
  if (value === null || value === '') return t('ops.value.empty')
  return typeof value === 'string' || typeof value === 'number' ? String(value) : t('ops.value.changed')
}

type RowDiff = NonNullable<DiffField['rows']>[number]
interface Cell { key: string; label: string; before?: string; after?: string; kept?: boolean }

function columnsOf(d: DiffField): Fields {
  const field = props.fields && Object.hasOwn(props.fields, d.field) ? props.fields[d.field] : undefined
  return field?.type === 'list' ? field.of : {}
}

const filled = (value: Json | undefined) => value !== undefined && value !== null && value !== ''

/** One cell value of a row; a column the schema no longer has shows plain text. */
function cellText(columns: Fields, key: string, value: Json | undefined): string {
  if (Object.hasOwn(columns, key)) return displayValue(columns[key]!, value ?? null, props.locale, { t, format })
  return value === undefined || value === null || value === '' ? t('ops.value.empty') : typeof value === 'string' || typeof value === 'number' ? String(value) : t('ops.value.changed')
}

/** A changed row by its name (first text column, else the item label): its changed cells as old → new, then its other
 *  shown, filled cells as they stay (the allergens next to a new dish). Added and removed rows list their filled cells. */
function rowView(d: DiffField, row: RowDiff) {
  const columns = columnsOf(d)
  const list = props.fields && Object.hasOwn(props.fields, d.field) ? props.fields[d.field] : undefined
  const data = (row.after ?? row.before) as Record<string, Json> | null
  const named = rowTitle(columns, row.before ?? row.after, props.locale, { t, format })
  const title = named?.text || (list?.type === 'list' ? shown(list.itemLabel) : '')
  const label = (key: string) => (Object.hasOwn(columns, key) ? shown(columns[key]!.label) : key)
  const cells: Cell[] = row.change === 'changed' ? changedCells(columns, row, named?.key, label) : Object.keys(columns).filter((key) => key !== named?.key && data && filled(data[key])).map((key) => ({ key, label: label(key), after: cellText(columns, key, data![key]) }))
  return { id: row.id, change: row.change, title, cells }
}

function changedCells(columns: Fields, row: RowDiff, titleKey: string | undefined, label: (key: string) => string): Cell[] {
  const before = (row.before ?? {}) as Record<string, Json>
  const after = (row.after ?? {}) as Record<string, Json>
  const changed = new Set((row.fields ?? []).filter((k) => k !== '_id'))
  const keys = [...ordered(columns).map(([k]) => k), ...[...changed].filter((k) => !Object.hasOwn(columns, k))]
  return keys.flatMap((key): Cell[] => {
    if (changed.has(key)) return [{ key, label: label(key), before: cellText(columns, key, before[key]), after: cellText(columns, key, after[key]) }]
    const column = columns[key]
    if (key === '_id' || key === titleKey || !column || column.retired || !isShown(column, after) || (!filled(before[key]) && !filled(after[key]))) return []
    return [{ key, label: label(key), after: cellText(columns, key, after[key]), kept: true }]
  })
}

const asText = (value: Json | null): string => (typeof value === 'string' ? value : '')
const isLong = (d: DiffField, u: Unit) => LONG.has(d.kind) && (typeof u.before === 'string' || u.before === null) && (typeof u.after === 'string' || u.after === null)
</script>

<template>
  <div class="grid gap-3">
    <section v-for="{ d, units } in items" :key="d.field" class="grid gap-1.5">
      <h4 class="font-semibold">{{ d.label }}</h4>
      <template v-if="!d.rows">
        <div v-for="(u, i) in units" :key="i" class="grid gap-1 rounded-md border bg-card px-3 py-2">
          <p v-if="u.tag" class="text-sm font-medium text-muted-foreground">{{ u.tag }}</p>
          <div v-if="isLong(d, u)" class="grid gap-1">
            <p
              v-for="(p, n) in paragraphDiff(asText(u.before), asText(u.after))"
              :key="n"
              :class="p.kind === 'removed' ? 'text-muted-foreground' : 'font-medium'"
            >
              <del v-if="p.kind === 'removed'">− {{ p.text }}</del>
              <ins v-else class="no-underline">+ {{ p.text }}</ins>
            </p>
          </div>
          <dl v-else class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
            <dt class="text-muted-foreground">{{ t('review.diff.before') }}</dt>
            <dd>{{ show(d, u.before) }}</dd>
            <dt class="text-muted-foreground">{{ t('review.diff.after') }}</dt>
            <dd class="font-medium">{{ show(d, u.after) }}</dd>
          </dl>
        </div>
      </template>
      <ul v-if="d.rows?.length || d.reordered" class="grid gap-1.5 rounded-md border bg-card px-3 py-2 text-sm">
        <li v-for="r in d.rows?.map((row) => rowView(d, row))" :key="r.id" class="grid gap-0.5">
          <p :class="r.change === 'removed' ? 'text-muted-foreground' : 'font-medium'">
            <del v-if="r.change === 'removed'">− {{ r.title }}</del>
            <template v-else>{{ r.change === 'added' ? '+ ' : '' }}{{ r.title }}</template>
          </p>
          <p v-for="c in r.cells" :key="c.key" class="flex min-w-0 flex-wrap gap-x-1 pl-3" :title="c.before !== undefined ? `${c.label}: ${c.before} → ${c.after}` : `${c.label}: ${c.after}`">
            <span class="shrink-0 text-muted-foreground">{{ `${c.label}: ` }}</span>
            <template v-if="c.before !== undefined">
              <span class="max-w-full truncate text-muted-foreground line-through">{{ `${c.before} ` }}</span>
              <span class="shrink-0">{{ `→ ` }}</span>
              <span class="min-w-0 break-words font-medium">{{ c.after }}</span>
            </template>
            <span v-else :class="['truncate', c.kept && 'text-muted-foreground']">{{ c.after }}</span>
          </p>
        </li>
        <li v-if="d.reordered">{{ t('review.diff.reordered') }}</li>
      </ul>
    </section>
  </div>
</template>
