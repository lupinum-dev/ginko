// The gastro hours are a thin wrapper over `@lupinum/ginko/patterns`. Wrong behaviour caught: a restaurant that never
// named a calendar loses its Austrian holidays.
import { describe, expect, it } from 'vitest'
import { hoursOn, type HoursContext } from '../src/index.ts'

describe('gastro hours keep Austria as the default calendar', () => {
  const week = Object.fromEntries((['mo', 'tu', 'we', 'th', 'fr', 'sa', 'su'] as const).map((day) => [day, { closed: false, from1: '09:00', to1: '17:00' }]))
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
