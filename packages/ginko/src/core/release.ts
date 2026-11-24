// The entry side of a release (SPEC 5.2 step 7), shared by the CLI's candidate (SPEC 5.1 step 4)
// and the platform's sites.release, so both build and check exactly the same data.
import { effectiveProfile, isTable, mapRows, rowDefaults, rowKeysOf, startValue } from './fields.ts'
import { stableJson } from './sha256.ts'
import type { SiteWeek } from './time.ts'
import type { Fields, Json, Schema } from './types.ts'

const isRecord = (value: unknown): value is Record<string, Json> => typeof value === 'object' && value !== null && !Array.isArray(value)

/**
 * The data an existing entry gets in a release: the start values of new required fields, the defaults of new required
 * columns in every row that lacks them, the rows a rows field gains filled from its columns' defaults (diffSchema
 * refuses a gained row they cannot fill), without the rows it lost (stated in `retired`), then the migration writes. `roots` names the root fields whose value changed.
 * `weeks`: the site's week before and in the release, for the rows of a rows field of days.
 */
export function releaseData(stored: Fields, next: Fields, data: Record<string, Json>, written: Record<string, Json>, weeks: readonly [SiteWeek, SiteWeek]): { data: Record<string, Json>; roots: string[] } {
  const out: Record<string, Json> = { ...data }
  for (const [name, field] of Object.entries(next)) {
    if (field.retired) continue
    const old = Object.hasOwn(stored, name) ? stored[name] : undefined
    if (!old) {
      const start = field.optional ? undefined : startValue(field, weeks[1])
      if (start !== undefined) out[name] = start
      continue
    }
    if (!isTable(field) || old.type !== field.type || out[name] === undefined || out[name] === null) continue
    const columns = Object.entries(field.of).filter(([column, inner]) => !Object.hasOwn(old.of, column) && !inner.optional && !inner.retired && inner.default !== undefined)
    if (columns.length) {
      out[name] = mapRows(field, out[name]!, (row) => {
        const filled = { ...row }
        for (const [column, inner] of columns) if (filled[column] === undefined) filled[column] = inner.default!
        return filled
      })
    }
    if (field.type === 'rows' && old.type === 'rows' && isRecord(out[name])) {
      const [had, now] = [rowKeysOf(old, weeks[0]), rowKeysOf(field, weeks[1])]
      const row = rowDefaults(field.of)
      const kept = Object.entries(out[name] as Record<string, Json>).filter(([key]) => !had.includes(key) || now.includes(key))
      const gained = now.filter((key) => !had.includes(key) && (out[name] as Record<string, Json>)[key] === undefined)
      // A row the field lost is stated in `retired` (diffSchema refuses it otherwise): the release removes it.
      if (kept.length !== Object.keys(out[name] as Record<string, Json>).length || (row && gained.length)) {
        out[name] = { ...Object.fromEntries(kept), ...(row ? Object.fromEntries(gained.map((key) => [key, row])) : {}) }
      }
    }
  }
  Object.assign(out, written)
  const roots = Object.keys(out).filter((root) => stableJson(out[root] ?? null) !== stableJson(data[root] ?? null))
  return { data: out, roots }
}

/**
 * Whether a release must validate every stored entry of `brick`, also the unchanged ones: its fields
 * changed, so an entry valid yesterday (a lowered `min` off the step grid, a migration that returned
 * nothing) may not be valid any more. The same holds for a text that may hold components when the
 * components changed: a removed prop or component would break a stored text. New bricks have no stored entries.
 */
export function recheckAll(stored: Schema, next: Schema, brick: string): boolean {
  const before = Object.hasOwn(stored.bricks, brick) ? stored.bricks[brick] : undefined
  const after = Object.hasOwn(next.bricks, brick) ? next.bricks[brick] : undefined
  if (!before || !after) return false
  if (stableJson(before.fields as unknown as Json) !== stableJson(after.fields as unknown as Json)) return true
  return stableJson((stored.components ?? null) as Json) !== stableJson((next.components ?? null) as Json) && holdsComponents(after.fields)
}

/** Only a `page` text can hold components (markdown.ts). */
function holdsComponents(fields: Fields): boolean {
  return Object.values(fields).some((field) => field.type === 'markdown' ? effectiveProfile(field) === 'page' : isTable(field) && holdsComponents(field.of))
}
