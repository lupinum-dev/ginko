// Rows of a list field compared by their `_id`: what History shows of a list change, and the merge when
// two people changed the same list at once. Pure functions, shared by the server and the Studio.
import { stableJson } from './sha256.ts'
import type { Json } from './types.ts'

type Row = Record<string, Json>

export interface RowDiff {
  /** The row's `_id`; `#<index>` for a row without one (legacy data). */
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
