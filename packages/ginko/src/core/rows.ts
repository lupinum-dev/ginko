// Rows of a list field compared by their `_id`, and rows of a rows field by their key: what History shows of a change,
// and the merge when two people changed the same list at once. Pure functions, shared by the server and the Studio.
import { stableJson } from './sha256.ts'
import type { Json } from './types.ts'

type Row = Record<string, Json>

export interface RowDiff {
  /** The row's `_id` (`#<index>` for a list row without one, legacy data), or a rows field's row key. */
  id: string
  change: 'added' | 'removed' | 'changed'
  before: Json | null
  after: Json | null
  /** Keys of the row whose value differs (only for `changed`). */
  fields?: string[]
}

const isRow = (value: Json | null | undefined): value is Row => typeof value === 'object' && value !== null && !Array.isArray(value)
const differs = (a: Json | null | undefined, b: Json | null | undefined) => stableJson((a ?? null) as Json) !== stableJson((b ?? null) as Json)
const rowsOf = (value: Json | null | undefined): Row[] => (Array.isArray(value) ? value : []).filter(isRow)
const idOf = (row: Row, i: number) => (typeof row._id === 'string' ? row._id : `#${i}`)
const byId = (rows: Row[]) => new Map(rows.map((row, i) => [idOf(row, i), row]))

/** Added, removed and changed rows of a list by `_id`, and whether the rows both sides keep moved. */
export function rowDiffs(before: Json | null | undefined, after: Json | null | undefined): { rows: RowDiff[]; reordered?: true } {
  const oldById = byId(rowsOf(before))
  const nextById = byId(rowsOf(after))
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
  return reordered ? { rows, reordered } : { rows }
}

/**
 * Added, removed and changed rows of a rows field (`{ mo: { … }, … }`) by row key, in `order`: the field's rows
 * (`rowKeysOf`), so the lines read Monday to Friday whatever order the stored maps hold their keys in. A row the
 * field no longer has comes after them.
 */
export function keyedRowDiffs(before: Json | null | undefined, after: Json | null | undefined, order: readonly string[]): { rows: RowDiff[] } {
  const was = isRow(before) ? before : {}
  const now = isRow(after) ? after : {}
  const rows: RowDiff[] = []
  for (const key of new Set([...order, ...Object.keys(now), ...Object.keys(was)])) {
    const old = Object.hasOwn(was, key) ? was[key] : undefined
    const row = Object.hasOwn(now, key) ? now[key] : undefined
    if (old === undefined && row === undefined) continue
    if (old === undefined) rows.push({ id: key, change: 'added', before: null, after: row! })
    else if (row === undefined) rows.push({ id: key, change: 'removed', before: old, after: null })
    else if (differs(old, row)) {
      const fields = isRow(old) && isRow(row) ? [...new Set([...Object.keys(old), ...Object.keys(row)])].filter((k) => differs(old[k], row[k])) : undefined
      rows.push({ id: key, change: 'changed', before: old, after: row, ...(fields ? { fields } : {}) })
    }
  }
  return { rows }
}

/**
 * Both people's row changes of one list since `base`: their list in their order, my edits on rows
 * they left as they were, my removals of rows they did not change, and my new rows after the row
 * before them in my list (after their new rows there). `clashes` are the ids of rows both changed
 * differently, or one changed and the other removed. A moved row, or a row without `_id`, cannot be
 * merged row by row: `reordered` says so, and the person chooses one version.
 */
export function mergeRows(base: Json | null | undefined, mine: Json | null | undefined, theirs: Json | null | undefined): { rows: Row[]; clashes: string[]; reordered: boolean } {
  const lists = [rowsOf(base), rowsOf(mine), rowsOf(theirs)] as const
  const legacy = lists.some((rows) => rows.some((row) => typeof row._id !== 'string'))
  const [b, m, t] = [byId(lists[0]), byId(lists[1]), byId(lists[2])]
  const reordered = legacy || !!rowDiffs(base, mine).reordered || !!rowDiffs(base, theirs).reordered
  const clashes: string[] = []
  const rows: Row[] = []
  for (const [id, their] of t) {
    const was = b.get(id)
    const my = m.get(id)
    if (!was) {
      if (my && differs(my, their)) clashes.push(id)
      rows.push(their)
    } else if (!my) {
      if (differs(was, their)) {
        clashes.push(id)
        rows.push(their)
      }
    } else if (differs(was, my) && differs(was, their) && differs(my, their)) {
      clashes.push(id)
      rows.push(their)
    } else rows.push(differs(was, my) ? my : their)
  }
  for (const [id, was] of b) {
    const my = m.get(id)
    if (!t.has(id) && my && differs(was, my)) clashes.push(id)
  }
  // My new rows, each after the row before it in my list; their new rows right there come first.
  const ids = rows.map(idOf)
  let previous: string | undefined
  for (const [id, row] of m) {
    if (!b.has(id) && !t.has(id)) {
      let at = previous === undefined ? 0 : ids.indexOf(previous) + 1
      while (at < ids.length && !b.has(ids[at]!) && !m.has(ids[at]!)) at++
      rows.splice(at, 0, row)
      ids.splice(at, 0, id)
    }
    if (ids.includes(id)) previous = id
  }
  return { rows, clashes, reordered }
}

/**
 * Both people's changes of one rows field (`{ mo: { … }, … }`) since `base`, row by row: a row only one side changed
 * takes that side's row. `clashes` are the keys of rows both changed differently; such a row keeps theirs, and the
 * person chooses one version. Rows are never added or moved by people, so there is nothing else to merge.
 */
export function mergeKeyedRows(base: Json | null | undefined, mine: Json | null | undefined, theirs: Json | null | undefined): { rows: Row; clashes: string[] } {
  const [b, m, t] = [base, mine, theirs].map((value) => (isRow(value) ? value : {})) as [Row, Row, Row]
  const rows: Row = {}
  const clashes: string[] = []
  for (const key of new Set([...Object.keys(t), ...Object.keys(m)])) {
    const [was, my, their] = [b[key], m[key], t[key]]
    if (differs(was, my) && differs(was, their) && differs(my, their)) clashes.push(key)
    const value = differs(was, my) && !clashes.includes(key) ? my : their
    if (value !== undefined) rows[key] = value
  }
  return { rows, clashes }
}
