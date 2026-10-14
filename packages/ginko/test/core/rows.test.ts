import { describe, expect, it } from 'vitest'
import { mergeRows } from '../../src/core/index.ts'

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
