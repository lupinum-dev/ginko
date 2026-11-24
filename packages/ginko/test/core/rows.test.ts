import { describe, expect, it } from 'vitest'
import { keyedRowDiffs, mergeKeyedRows, mergeRows } from '../../src/core/index.ts'

const row = (id: string, name = id) => ({ _id: id, name })
const ids = (rows: { _id?: unknown }[]) => rows.map((r) => r._id)

// Wrong behaviour caught: "Beides behalten" drops one person's rows, applies an edit over a removal,
// or merges what only one version can hold (moved rows, rows without id).
describe('mergeRows', () => {
  it.each([
    ['both add a row', [row('a')], [row('a'), row('x')], [row('a'), row('y')], ['a', 'y', 'x'], [], false],
    ['I add at the start, they add at the end', [row('a')], [row('x'), row('a')], [row('a'), row('y')], ['x', 'a', 'y'], [], false],
    ['I remove a row they left alone', [row('a'), row('b')], [row('a')], [row('a'), row('b'), row('y')], ['a', 'y'], [], false],
    ['I remove a row they changed', [row('a'), row('b')], [row('a')], [row('a'), row('b', 'B2')], ['a', 'b'], ['b'], false],
    ['they remove a row I changed', [row('a'), row('b')], [row('a'), row('b', 'B1')], [row('a')], ['a'], ['b'], false],
    ['we change different rows', [row('a'), row('b')], [row('a', 'A1'), row('b')], [row('a'), row('b', 'B2')], ['a', 'b'], [], false],
    ['we change one row differently', [row('a')], [row('a', 'A1')], [row('a', 'A2')], ['a'], ['a'], false],
    ['they moved rows', [row('a'), row('b')], [row('a'), row('b'), row('x')], [row('b'), row('a')], ['b', 'x', 'a'], [], true],
    ['a row without id', [{ name: 'a' }], [{ name: 'a' }, row('x')], [{ name: 'a' }], [undefined, 'x'], [], true],
  ])('%s', (_, base, mine, theirs, rows, clashes, reordered) => {
    const merged = mergeRows(base, mine, theirs)
    expect([ids(merged.rows), merged.clashes, merged.reordered]).toEqual([rows, clashes, reordered])
  })

  it('takes my edit on a row they left as it was', () => {
    expect(mergeRows([row('a')], [row('a', 'A1')], [row('a'), row('y')]).rows).toEqual([row('a', 'A1'), row('y')])
  })
})

// Wrong behaviour caught: two people on different days of a weekday table cannot keep both, or a clash on one day is
// merged and one person's value is lost.
describe('mergeKeyedRows', () => {
  const week = (mo: string, tu: string) => ({ mo: { note: mo }, tu: { note: tu } })
  it.each([
    ['we change different rows', week('a', 'b'), week('A1', 'b'), week('a', 'B2'), week('A1', 'B2'), []],
    ['we change one row differently', week('a', 'b'), week('A1', 'b'), week('A2', 'b'), week('A2', 'b'), ['mo']],
    ['we change one row the same way', week('a', 'b'), week('A1', 'b'), week('A1', 'b'), week('A1', 'b'), []],
    ['only they changed', week('a', 'b'), week('a', 'b'), week('a', 'B2'), week('a', 'B2'), []],
  ])('%s', (_, base, mine, theirs, rows, clashes) => {
    expect(mergeKeyedRows(base, mine, theirs)).toEqual({ rows, clashes })
  })
})

// Wrong behaviour caught: history and conflict lines follow the stored map's key order (Convex sorts keys), so they read
// "Freitag, Montag, Samstag".
describe('keyedRowDiffs', () => {
  it('lists the rows in the field order, a row the field no longer has after them', () => {
    const before = { fr: { dish: 'Fisch' }, mo: { dish: 'Suppe' }, sa: { dish: 'Alt' }, tu: { dish: 'Gulasch' } }
    const after = { fr: { dish: 'Forelle' }, mo: { dish: 'Kürbissuppe' }, tu: { dish: 'Gulasch' }, we: { dish: 'Strudel' } }
    const rows = keyedRowDiffs(before, after, ['mo', 'tu', 'we', 'th', 'fr']).rows
    expect(rows.map((r) => [r.id, r.change])).toEqual([['mo', 'changed'], ['we', 'added'], ['fr', 'changed'], ['sa', 'removed']])
  })
})
