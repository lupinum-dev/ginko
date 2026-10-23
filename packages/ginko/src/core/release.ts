// The entry side of a release (SPEC 5.2 step 7), shared by the CLI's candidate (SPEC 5.1 step 4)
// and the platform's sites.release, so both build and check exactly the same data.
import { effectiveProfile } from './fields.ts'
import { stableJson } from './sha256.ts'
import type { Fields, Json, Schema } from './types.ts'

const isRecord = (value: unknown): value is Record<string, Json> => typeof value === 'object' && value !== null && !Array.isArray(value)

/**
 * The data an existing entry gets in a release: the defaults of new required fields, the defaults of
 * new required list columns in every row that lacks them, then the migration writes. `roots` names
 * the root fields whose value changed.
 */
export function releaseData(stored: Fields, next: Fields, data: Record<string, Json>, written: Record<string, Json>): { data: Record<string, Json>; roots: string[] } {
  const out: Record<string, Json> = { ...data }
  for (const [name, field] of Object.entries(next)) {
    if (field.retired) continue
    const old = Object.hasOwn(stored, name) ? stored[name] : undefined
    if (!old) {
      if (!field.optional && field.default !== undefined) out[name] = field.default
      continue
    }
    if (field.type !== 'list' || old.type !== 'list' || !Array.isArray(out[name])) continue
    const columns = Object.entries(field.of).filter(([column, inner]) => !Object.hasOwn(old.of, column) && !inner.optional && !inner.retired && inner.default !== undefined)
    if (!columns.length) continue
    out[name] = (out[name] as Json[]).map((row) => {
      if (!isRecord(row)) return row
      const filled = { ...row }
      for (const [column, inner] of columns) if (filled[column] === undefined) filled[column] = inner.default!
      return filled
    })
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
  return Object.values(fields).some((field) => field.type === 'markdown' ? effectiveProfile(field) === 'page' : field.type === 'list' && holdsComponents(field.of))
}
