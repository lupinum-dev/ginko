// Coming plans table. Wrong behaviour caught: the table shows a season running to its nominal end although a later
// plan that overlaps its tail takes the days over (planOn: latest `from` wins), so the table and the hours disagree.
import { describe, expect, it } from 'vitest'
import { upcomingPlans, type HourPlan } from '../../src/basics/index.ts'

const week = (to: string) => (['mo', 'tu', 'we', 'th', 'fr', 'sa', 'su'] as const).map((day) => ({ _id: day, day, closed: false, from1: '10:00', to1: to }))
const summer: HourPlan = { from: '2027-07-01', to: '2027-08-31', yearly: true, week: week('18:00') }
const late = (from: string, to: string): HourPlan => ({ from, to, week: week('16:00') })
const ranges = (plans: HourPlan[]) => upcomingPlans(plans, '2027-06-01', 120).map((p) => [p.starts, p.ends])

describe('upcomingPlans ranges', () => {
  it.each([
    ['no overlap', [summer], [['2027-07-01', '2027-08-31']]],
    ['a later plan takes the tail', [summer, late('2027-08-15', '2027-09-15')], [['2027-07-01', '2027-08-14'], ['2027-08-15', '2027-09-15']]],
    ['a plan nested inside leaves the end alone', [summer, late('2027-08-10', '2027-08-12')], [['2027-07-01', '2027-08-31'], ['2027-08-10', '2027-08-12']]],
  ])('%s', (_name, plans, expected) => {
    expect(ranges(plans)).toEqual(expected)
  })
})
