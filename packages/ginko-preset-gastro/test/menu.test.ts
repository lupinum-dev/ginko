// Whether a dish shows and whether it is sold out: a wrong answer lists a dish out of season or keeps yesterday's
// "heute aus" on the menu.
import { describe, expect, it } from 'vitest'
import { dishOn } from '../src/menu.ts'

describe('dishOn', () => {
  it.each([
    ['a dish stored before the fields is on the menu and not sold out', {}, { shown: true, soldOut: false }],
    ['taken off the menu (after its season)', { onMenu: false }, { shown: false, soldOut: false }],
    ['on the menu', { onMenu: true }, { shown: true, soldOut: false }],
    ['sold out today', { soldOutOn: '2026-10-08' }, { shown: true, soldOut: true }],
    ['sold out yesterday: back today', { soldOutOn: '2026-10-07' }, { shown: true, soldOut: false }],
    ['sold out tomorrow: still there today', { soldOutOn: '2026-10-09' }, { shown: true, soldOut: false }],
    ['cleared fields count as missing', { onMenu: null, soldOutOn: null }, { shown: true, soldOut: false }],
  ] as const)('%s', (_name, dish, expected) => {
    expect(dishOn(dish, '2026-10-08')).toEqual(expected)
  })
})
