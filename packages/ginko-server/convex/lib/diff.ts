// The one diff builder (SPEC 4.2 "Verlauf"): changes.get and proposals.get show a change as
// a list of root fields with their old and new value. Pure functions, no Convex.
import type { Fields, Json } from '@lupinum/ginko'
import { isTranslatable, labelOf, stableJson } from '@lupinum/ginko/internal'

export interface LocaleDiff { locale: string; before: Json | null; after: Json | null }
export interface RowDiff {
  /** The row's `_id`. */
  id: string
  change: 'added' | 'removed' | 'changed'
  before: Json | null
  after: Json | null
  /** Keys of the row whose value differs (only for `changed`). */
  fields?: string[]
}
export interface FieldDiff {
  field: string
  label: string
  /** The field type from the schema (`state` for the status of a publish; `unknown` when the schema no longer has the field). */
  kind: string
  before: Json | null
  after: Json | null
  /** Translatable fields: the locales whose value differs. */
  locales?: LocaleDiff[]
  /** Lists: added, removed and changed rows by `_id`. */
  rows?: RowDiff[]
  /** Lists: the same rows in a different order. */
  reordered?: boolean
}

const isRecord = (value: Json | null | undefined): value is Record<string, Json> => typeof value === 'object' && value !== null && !Array.isArray(value)
const differs = (a: Json | null | undefined, b: Json | null | undefined) => stableJson((a ?? null) as Json) !== stableJson((b ?? null) as Json)

function localeDiffs(before: Json | null, after: Json | null): LocaleDiff[] {
  const a = isRecord(before) ? before : {}
  const b = isRecord(after) ? after : {}
  return [...new Set([...Object.keys(a), ...Object.keys(b)])]
    .filter((locale) => differs(a[locale], b[locale]))
    .map((locale) => ({ locale, before: a[locale] ?? null, after: b[locale] ?? null }))
}

function rowDiffs(before: Json | null, after: Json | null): Pick<FieldDiff, 'rows' | 'reordered'> {
  const rowsOf = (value: Json | null) => (Array.isArray(value) ? value : []).filter(isRecord)
  const old = rowsOf(before)
  const next = rowsOf(after)
  const idOf = (row: Record<string, Json>, i: number) => (typeof row._id === 'string' ? row._id : `#${i}`)
  const oldById = new Map(old.map((row, i) => [idOf(row, i), row]))
  const nextById = new Map(next.map((row, i) => [idOf(row, i), row]))
  const rows: RowDiff[] = []
  for (const [id, row] of nextById) {
    const was = oldById.get(id)
    if (!was) rows.push({ id, change: 'added', before: null, after: row })
    else if (differs(was, row)) {
      const keys = [...new Set([...Object.keys(was), ...Object.keys(row)])].filter((k) => differs(was[k], row[k]))
      rows.push({ id, change: 'changed', before: was, after: row, fields: keys })
    }
  }
  for (const [id, row] of oldById) if (!nextById.has(id)) rows.push({ id, change: 'removed', before: row, after: null })
  const kept = (map: Map<string, unknown>, other: Map<string, unknown>) => [...map.keys()].filter((id) => other.has(id))
  const reordered = kept(oldById, nextById).join('\n') !== kept(nextById, oldById).join('\n')
  return { rows, ...(reordered ? { reordered } : {}) }
}

/**
 * One entry per root field that appears in `before` or `after`: label and type from the schema,
 * plus the per-locale or per-row detail for translatable fields and lists.
 */
export function diffFields(fields: Fields | undefined, before: Record<string, Json>, after: Record<string, Json>, main: string): FieldDiff[] {
  return [...new Set([...Object.keys(before), ...Object.keys(after)])].map((name): FieldDiff => {
    const field = fields && Object.hasOwn(fields, name) ? fields[name] : undefined
    const was = before[name] ?? null
    const now = after[name] ?? null
    const base = { field: name, label: field ? labelOf(field.label, main, main) : name, kind: field?.type ?? 'unknown', before: was, after: now }
    if (!field) return base
    if (isTranslatable(field)) return { ...base, locales: localeDiffs(was, now) }
    if (field.type === 'list') return { ...base, ...rowDiffs(was, now) }
    return base
  })
}
