import { ALT_MAX, effectiveMax, isTranslatable } from './fields.ts'
import type { Field, Fields } from './types.ts'

/**
 * Content budget per site (SPEC 3): one rule for the platform's writes, imports and releases, the CLI's checks and
 * the Studio's meters. Bytes are the stored text, the JSON of an entry's `data` and `prints`. Markdown trees are
 * derived from that text and do not count; `treeBytes` only bounds their total, so the public bundle a site reads
 * stays inside Convex's read limit even for text that is almost all formatting.
 *
 * `entryBytes` is 480 KiB, not 512: a history row holds the before and after of a changed field, and two values of
 * 512 KiB would pass Convex's 1 MiB document limit. `trashBytes` caps the removed entries, which count apart from the
 * site: a removal past it deletes the oldest removed entries early, and an import past it is refused.
 */
export const SITE_BUDGET = { siteBytes: 4 * 1024 * 1024, entries: 2000, entryBytes: 480 * 1024, treeBytes: 8 * 1024 * 1024, trashBytes: 4 * 1024 * 1024 } as const

/** UTF-8 bytes of `value` as JSON, the way the budget counts. */
export function byteSize(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value ?? null)).byteLength
}

/** The bytes one entry counts against the budget: its text, not its derived trees. */
export function entryBytes(data: unknown, prints: unknown = {}): number {
  return byteSize(data) + byteSize(prints)
}

/**
 * Whether a write keeps a byte count within `limit`. A write that does not grow the count always passes, so an
 * entry or a site that is over its limit (after an import, or a lowered limit) can still be shortened.
 */
export function fitsBudget(after: number, before: number, limit: number): boolean {
  return after <= limit || after <= before
}

/** JSON around one stored value (quotes, key, comma); an entry or list-row id; one short stored value (a number, a date, an option). */
const VALUE_JSON = 8
const ID_BYTES = 40
const SHORT_VALUE = 32

/**
 * About how many bytes a full value of `field` takes: every text at its max in every language, every list at its max
 * rows. One byte per character, as for Latin text (worst-case UTF-8 would flag almost every schema). Several refs
 * without a `max` count 0. An estimate for `ginko check`; the platform's exact count stays the authority.
 */
export function largestFieldBytes(field: Field, locales: readonly string[]): number {
  if (field.retired) return 0
  const values = isTranslatable(field) ? locales.length : 1
  switch (field.type) {
    case 'text': case 'longtext': case 'markdown': return (effectiveMax(field) + VALUE_JSON) * values
    case 'list': return field.max * (largestEntryBytes(field.of, locales) + ID_BYTES)
    case 'choices': return effectiveMax(field) * ID_BYTES
    case 'ref': return field.multiple ? (field.max ?? 0) * ID_BYTES : ID_BYTES
    case 'image': case 'file': return ID_BYTES + ALT_MAX * locales.length
    default: return SHORT_VALUE * values
  }
}

/** About how many bytes an entry with every field full takes (largestFieldBytes summed), to compare with SITE_BUDGET.entryBytes. */
export function largestEntryBytes(fields: Fields, locales: readonly string[]): number {
  return Object.values(fields).reduce((sum, field) => sum + largestFieldBytes(field, locales), 0)
}
