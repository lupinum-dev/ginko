import { isTranslatable } from './fields.ts'
import { printOf } from './resolve.ts'
import { stableJson } from './sha256.ts'
import type { Field, Fields, Json, Locale } from './types.ts'

/** Translation prints: leaf path → locale → print of the main-language value the translation was made from. */
export type Prints = Record<string, Record<string, string>>

/** Every translatable leaf of a root field: path → value per locale. Paths match resolveEntry's fallback paths. */
export function leavesOf(field: Field, value: Json | undefined, path: string, out: Map<string, Record<string, Json>> = new Map()) {
  if (value === undefined || value === null) return out
  if (isTranslatable(field)) out.set(path, asRecord(value))
  else if (field.type === 'image') out.set(`${path}.alt`, asRecord(asRecord(value).alt))
  else if (field.type === 'list' && Array.isArray(value)) {
    for (const row of value) {
      if (!isRecord(row)) continue
      for (const [key, inner] of Object.entries(field.of)) leavesOf(inner, row[key], `${path}.${String(row._id)}.${key}`, out)
    }
  }
  return out
}

/**
 * Prints after a rewrite that keeps the meaning, such as the file IDs that replace image paths in a text on export, or
 * the new IDs an import gives those files: a translation that was current for the old main-language value stays
 * current for the new one. Other prints stay as they are.
 */
export function carryPrints(fields: Fields, before: Record<string, Json>, after: Record<string, Json>, prints: Prints, main: Locale): Prints {
  const out: Prints = Object.fromEntries(Object.entries(prints).map(([leaf, byLocale]) => [leaf, { ...byLocale }]))
  for (const [root, field] of Object.entries(fields)) {
    if (stableJson(before[root] ?? null) === stableJson(after[root] ?? null)) continue
    const old = leavesOf(field, before[root], root)
    for (const [leaf, values] of leavesOf(field, after[root], root)) {
      const was = old.get(leaf)
      const kept = out[leaf]
      if (!was || !kept) continue
      const current = printOf(was[main])
      for (const locale of Object.keys(kept)) if (kept[locale] === current) kept[locale] = printOf(values[main])
    }
  }
  return out
}

function isRecord(v: unknown): v is Record<string, Json> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function asRecord(v: unknown): Record<string, Json> {
  return isRecord(v) ? v : {}
}
