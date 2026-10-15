// hours, hourPlans, notices, events and gallery are thin wrappers over `@lupinum/ginko/basics`. Wrong behaviour caught:
// a change to the neutral basics leaks into every restaurant's stored schema (labels, hints, tasks, defaults), or a
// restaurant that never named a calendar loses its Austrian holidays.
import { serializeSchema, sha256, stableJson } from '@lupinum/ginko/internal'
import { describe, expect, it } from 'vitest'
import site from '../../../sites/restaurant/ginko.config.ts'
import { hoursOn, type DayHours, type HoursContext } from '../src/index.ts'

describe('gastro bricks over the basics', () => {
  it('store what 0.4 stored for the restaurant fixture, plus the hours status', () => {
    const bricks = serializeSchema(site).bricks
    // The one addition since 0.4: the hours single declares its Today status line.
    const { status, ...hours } = bricks.hours!
    expect(status).toEqual({ hours: true })
    const moved = Object.fromEntries(['hours', 'hourPlans', 'notices', 'events', 'gallery'].map((key) => [key, key === 'hours' ? hours : bricks[key]]))
    // sha256 of the five bricks in contracts/restaurant/schema.json before the move (commit 4384ea59).
    expect(sha256(stableJson(JSON.parse(JSON.stringify(moved))))).toBe('b0b2bd1b9bf8e6a9b777b97beab057057ce213dbe1e4ee38101e9f855252e8a3')
  })
})

describe('gastro hours keep Austria as the default calendar', () => {
  const week: DayHours[] = (['mo', 'tu', 'we', 'th', 'fr', 'sa', 'su'] as const).map((day) => ({ day, closed: false, from1: '09:00', to1: '17:00' }))
  const ctx = (over: Partial<HoursContext>): HoursContext => ({ hours: { week, exceptions: [], holidays: 'closed' }, ...over })
  // 26 Oct 2026 is the Austrian National Day, 3 Oct German Unity Day.
  it.each([
    // context, date, closed
    [{}, '2026-10-26', true],
    [{ country: '' }, '2026-10-26', true],
    [{ country: 'DE' }, '2026-10-26', false],
    [{ country: 'DE' }, '2026-10-03', true],
    [{ country: 'FR' }, '2026-10-26', false],
    [{ calendar: 'none' }, '2026-10-26', false],
  ] as const)('%o on %s', (over, date, closed) => {
    expect(hoursOn(ctx(over), date).closed).toBe(closed)
  })
})
