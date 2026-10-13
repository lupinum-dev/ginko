import { describe, expect, it } from 'vitest'
import { DEFAULT_WEEK, plannedWeeks, staleOf, weekInfoOf, type Schema, type Task } from '../../src/core/index.ts'

const lunch = {
  fields: { weekOf: { type: 'date' }, note: { type: 'text' } },
  tasks: [{ id: 'lunchWeek', label: 'Mittagsmenü', kind: 'edit', fields: ['weekOf', 'note'], prefill: { weekOf: '@workWeek' } }] as Task[],
}

describe('staleOf (weekly upkeep)', () => {
  // Wrong behaviour caught: a Sunday check compares with the week that is ending, so a menu entered for the coming week is called out of date, or last week's is called current.
  it.each([
    ['Friday, this week entered', '2026-10-09', '2026-10-05', true],
    ['Friday, last week still there', '2026-10-09', '2026-09-28', false],
    ['Sunday, this (ending) week still there', '2026-10-11', '2026-10-05', false],
    ['Sunday, next week entered', '2026-10-11', '2026-10-12', true],
    ['Saturday, nothing entered', '2026-10-10', undefined, false],
  ])('%s', (_name, today, stored, current) => {
    expect(staleOf(lunch, stored ? { weekOf: stored } : {}, today, DEFAULT_WEEK)?.current).toBe(current)
  })

  // Wrong behaviour caught: a Sunday-first site compares with a Monday, so its current week is called out of date.
  it('uses the site week: on en-US Wednesday the week of Sunday 11 is current', () => {
    expect(staleOf(lunch, { weekOf: '2026-10-11' }, '2026-10-14', weekInfoOf('en-US'))?.current).toBe(true)
    expect(staleOf(lunch, { weekOf: '2026-10-11' }, '2026-10-14', DEFAULT_WEEK)?.current).toBe(false)
  })

  // Wrong behaviour caught: a menu planned ahead is not counted, so the Sunday mail nags although the week is ready; or any planned week hides a missing one.
  it.each([
    ['Sunday, coming week planned', '2026-10-11', ['2026-10-12'], true],
    ['Sunday, only another week planned', '2026-10-11', ['2026-10-19'], false],
    ['Sunday, the ending week planned', '2026-10-11', ['2026-10-05'], false],
  ])('%s', (_name, today, planned, current) => {
    expect(staleOf(lunch, { weekOf: '2026-10-05' }, today, DEFAULT_WEEK, planned)?.current).toBe(current)
  })

  // Wrong behaviour caught: planned weeks are read from collections that do not plan this brick.
  it('plannedWeeks takes the Mondays of the collections that plan the brick', () => {
    const schema = { bricks: {
      lunch: { kind: 'single' },
      plans: { kind: 'collection', plans: { brick: 'lunch', field: 'weekOf' } },
      events: { kind: 'collection', plans: { brick: 'other', field: 'when' } },
    } } as unknown as Schema
    const entries = (key: string): { data: Record<string, string> }[] => key === 'plans' ? [{ data: { weekOf: '2026-10-12' } }, { data: { note: 'x' } }] : [{ data: { when: '2026-10-19', weekOf: '2026-10-26' } }]
    expect(plannedWeeks(schema, 'lunch', entries)).toEqual(['2026-10-12'])
  })

  // Wrong behaviour caught: bricks without a weekly task are reported as out of date.
  it('is undefined without a week task', () => {
    expect(staleOf({ fields: lunch.fields, tasks: [{ id: 'e', label: 'E', kind: 'edit', fields: ['note'] }] }, {}, '2026-10-11', DEFAULT_WEEK)).toBeUndefined()
    expect(staleOf({ fields: lunch.fields }, {}, '2026-10-11', DEFAULT_WEEK)).toBeUndefined()
  })
})
