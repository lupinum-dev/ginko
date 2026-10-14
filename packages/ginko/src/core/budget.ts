/**
 * Content budget per site (SPEC 3): one rule for the platform's writes, imports and releases, the CLI's checks and
 * the Studio's meters. Bytes are the stored text, the JSON of an entry's `data` and `prints`. Markdown trees are
 * derived from that text and do not count; `treeBytes` only bounds their total, so the public bundle a site reads
 * stays inside Convex's read limit even for text that is almost all formatting.
 *
 * `entryBytes` is 480 KiB, not 512: a history row holds the before and after of a changed field, and two values of
 * 512 KiB would pass Convex's 1 MiB document limit.
 */
export const SITE_BUDGET = { siteBytes: 4 * 1024 * 1024, entries: 2000, entryBytes: 480 * 1024, treeBytes: 8 * 1024 * 1024 } as const

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
