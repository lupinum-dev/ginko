// The lunch page, the Heute board and the door sheet show one week. A wrong pick shows last week's dishes or hides a planned week.
import { describe, expect, it } from 'vitest'
import { DEFAULT_WEEK } from '@lupinum/ginko/internal'
import { lunchWeekOn } from '../src/lunch.ts'

const week = (weekOf: string, dish: string) => ({ data: { weekOf, days: [dish] } })
const main = week('2026-10-05', 'main')
const plans = [week('2026-09-28', 'past'), week('2026-10-12', 'planned-12'), week('2026-10-19', 'planned-19')]

describe('lunchWeekOn', () => {
  it.each([
    ['the main week is this week and nothing is planned for it', main, plans, '2026-10-07', 'main'],
    ['a planned week for this week wins over the main fields', main, plans, '2026-10-14', 'planned-12'],
    ['on the weekend the coming week counts: Sunday picks the planned Monday', main, plans, '2026-10-11', 'planned-12'],
    ['the planned week wins even when the main fields are for the same week', week('2026-10-12', 'main-12'), plans, '2026-10-13', 'planned-12'],
    ['a week after the plans: nothing to show', main, plans, '2026-10-27', undefined],
    ['only past planned weeks and a stale main week: nothing to show', main, [plans[0]!], '2026-10-14', undefined],
    ['no plans at all, stale main week: nothing to show', main, [], '2026-10-14', undefined],
  ] as const)('%s', (_name, m, p, today, expected) => {
    expect(lunchWeekOn(m, p, today, DEFAULT_WEEK)?.data.days[0]).toBe(expected)
  })
})
