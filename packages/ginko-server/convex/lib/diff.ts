// The one diff builder (SPEC 4.2 "Verlauf"): changes.get and proposals.get show a change as
// a list of root fields with their old and new value. Pure functions, no Convex. Rows of a list
// are compared in core (rowDiffs), which the Studio's conflict panel uses too.
import type { Fields, Json } from '@lupinum/ginko'
import { isTranslatable, labelOf, rowDiffs, stableJson, type RowDiff } from '@lupinum/ginko/internal'

export interface LocaleDiff { locale: string; before: Json | null; after: Json | null }
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
