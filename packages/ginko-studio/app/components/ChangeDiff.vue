<!-- What a change did, field by field (UI.md 10.5): "Before" and "After" in the words of the list
     (displayValue). Long text shows only the changed paragraphs, a rich text its changed blocks formatted (a heading
     as a heading, a bullet as a bullet, a picture as a thumbnail), each with a visible − / + in front so the change
     does not depend on colour. Shared by History and Review. -->
<script setup lang="ts">
import { api } from '#convex/api'
import { useI18n } from '#imports'
import type { Fields, Json, Locale } from '@lupinum/ginko'
import { fileRefOf } from '@lupinum/ginko/internal'
import { GinkoMarkdown } from '@lupinum/ginko/vue'
import { computedAsync } from '@vueuse/core'
import { computed, defineComponent, h } from 'vue'
import { displayValue, rowTitle } from '../utils/content'
import { markdownDiff, pictureIdsOf, type BlockChange } from '../utils/markdownDiff'
import { paragraphDiff } from '../utils/paragraphDiff'
import { useStudioSite } from '../utils/labels'
import type { DiffField } from '../utils/review'

/** `site`: for the thumbnails of pictures in rich texts; without it a picture shows its description only. */
const props = defineProps<{ diff: readonly DiffField[]; fields?: Fields; locale: Locale; site?: string }>()
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
interface Cell { key: string; label: string; before?: string; after?: string }

function columnsOf(d: DiffField): Fields {
  const field = props.fields && Object.hasOwn(props.fields, d.field) ? props.fields[d.field] : undefined
  return field?.type === 'list' ? field.of : {}
}

/** One cell value of a row; a column the schema no longer has shows plain text. */
function cellText(columns: Fields, key: string, value: Json | undefined): string {
  if (Object.hasOwn(columns, key)) return displayValue(columns[key]!, value ?? null, props.locale, { t, format })
  return value === undefined || value === null || value === '' ? t('ops.value.empty') : typeof value === 'string' || typeof value === 'number' ? String(value) : t('ops.value.changed')
}

/** A changed row by its name (first text column, else the item label) and its changed cells as old → new. Added and removed rows list their filled cells. */
function rowView(d: DiffField, row: RowDiff) {
  const columns = columnsOf(d)
  const list = props.fields && Object.hasOwn(props.fields, d.field) ? props.fields[d.field] : undefined
  const data = (row.after ?? row.before) as Record<string, Json> | null
  const named = rowTitle(columns, row.before ?? row.after, props.locale, { t, format })
  const title = named?.text || (list?.type === 'list' ? shown(list.itemLabel) : '')
  const label = (key: string) => (Object.hasOwn(columns, key) ? shown(columns[key]!.label) : key)
  const skip = (key: string) => key === '_id'
  const cells: Cell[] = row.change === 'changed'
    ? (row.fields ?? []).filter((k) => !skip(k)).map((key) => ({ key, label: label(key), before: cellText(columns, key, (row.before as Record<string, Json>)?.[key]), after: cellText(columns, key, (row.after as Record<string, Json>)?.[key]) }))
    : Object.keys(columns).filter((key) => key !== named?.key && data && data[key] !== undefined && data[key] !== null && data[key] !== '').map((key) => ({ key, label: label(key), after: cellText(columns, key, data![key]) }))
  return { id: row.id, change: row.change, title, cells }
}

const asText = (value: Json | null): string => (typeof value === 'string' ? value : '')
const isLong = (d: DiffField, u: Unit) => LONG.has(d.kind) && (typeof u.before === 'string' || u.before === null) && (typeof u.after === 'string' || u.after === null)
const isRich = (d: DiffField, u: Unit) => d.kind === 'markdown' && isLong(d, u)

// Rich texts: their changed blocks per field and language, parsed in the browser. Empty until parsed.
const blocks = computedAsync(async () => {
  const out = new Map<string, BlockChange[]>()
  for (const { d, units } of items.value) {
    for (const [i, u] of units.entries()) if (isRich(d, u)) out.set(`${d.field}:${i}`, await markdownDiff(asText(u.before), asText(u.after)))
  }
  return out
}, new Map<string, BlockChange[]>())
const pictureIds = computed(() => [...new Set([...blocks.value.values()].flatMap(pictureIdsOf))])
const pictures = useConvexQuery(api.uploads.urls, () => (props.site && pictureIds.value.length ? { site: props.site, ids: pictureIds.value } : 'skip'))

/** A picture in a rich text: a small thumbnail of the library file and its description, never its file id. */
const DiffPicture = defineComponent({
  props: { src: { type: String, default: '' }, alt: { type: String, default: '' } },
  setup(p) {
    return () => {
      const id = fileRefOf(p.src)
      const url = id ? pictures.data.value?.[id]?.url : undefined
      return h('span', { class: 'inline-grid max-w-full gap-1 align-top' }, [
        url ? h('img', { src: url, alt: '', class: 'h-24 w-auto max-w-full rounded-sm border object-cover' }) : null,
        h('span', { class: 'text-xs text-muted-foreground' }, p.alt || t('review.diff.picture')),
      ])
    }
  },
})
/** A link shows as underlined text: the history never navigates. */
const DiffLink = defineComponent({
  props: { href: { type: String, default: '' } },
  setup: (_, { slots }) => () => h('span', { class: 'underline underline-offset-2' }, slots.default?.()),
})
const richParts = { img: DiffPicture, a: DiffLink }
</script>

<template>
  <div class="grid gap-3">
    <section v-for="{ d, units } in items" :key="d.field" class="grid gap-1.5">
      <h4 class="font-semibold">{{ d.label }}</h4>
      <template v-if="!d.rows">
        <div v-for="(u, i) in units" :key="i" class="grid gap-1 rounded-md border bg-card px-3 py-2">
          <p v-if="u.tag" class="text-sm font-medium text-muted-foreground">{{ u.tag }}</p>
          <div v-if="isRich(d, u)" class="grid gap-1">
            <template v-for="(b, n) in blocks.get(`${d.field}:${i}`) ?? []" :key="n">
              <del v-if="b.kind === 'removed'" class="rich flex gap-2 rounded-sm bg-destructive/8 px-2 py-1">
                <span class="shrink-0">−</span>
                <Suspense><GinkoMarkdown class="min-w-0" :value="b.tree" :components="richParts" /></Suspense>
              </del>
              <ins v-else class="rich flex gap-2 rounded-sm bg-success/10 px-2 py-1 no-underline">
                <span class="shrink-0">+</span>
                <Suspense><GinkoMarkdown class="min-w-0" :value="b.tree" :components="richParts" /></Suspense>
              </ins>
            </template>
          </div>
          <div v-else-if="isLong(d, u)" class="grid gap-1">
            <p v-for="(p, n) in paragraphDiff(asText(u.before), asText(u.after))" :key="n">
              <del v-if="p.kind === 'removed'" class="block rounded-sm bg-destructive/8 px-2 py-1">− {{ p.text }}</del>
              <ins v-else class="block rounded-sm bg-success/10 px-2 py-1 no-underline">+ {{ p.text }}</ins>
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
            <span v-else class="truncate">{{ c.after }}</span>
          </p>
        </li>
        <li v-if="d.reordered">{{ t('review.diff.reordered') }}</li>
      </ul>
    </section>
  </div>
</template>

<style scoped>
/* A rich text block in the diff: compact, like the list's text, with headings and lists that still read as such. */
.rich :deep(.comark-content > *) { margin: 0; }
.rich :deep(:is(h1, h2, h3, h4, h5, h6)) { font-weight: 600; }
.rich :deep(h1), .rich :deep(h2) { font-size: 1.125rem; line-height: 1.4; }
.rich :deep(h3) { font-size: 1rem; }
.rich :deep(:is(ul, ol)) { padding-left: 1.25rem; }
.rich :deep(ul) { list-style: disc; }
.rich :deep(ol) { list-style: decimal; }
.rich :deep(blockquote) { border-left: 2px solid var(--border); padding-left: 0.75rem; }
.rich :deep(code) { border-radius: 0.25rem; background: var(--muted); padding: 0 0.25rem; font-family: ui-monospace, monospace; font-size: 0.9em; }
.rich :deep(pre) { overflow-x: auto; white-space: pre-wrap; font-family: ui-monospace, monospace; font-size: 0.875rem; }
/* A removed block is struck through to its last line, also inside the rendered text. */
del.rich :deep(.comark-content) { text-decoration: line-through; }
</style>
