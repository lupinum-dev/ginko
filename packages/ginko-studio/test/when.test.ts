// "Online ab 9:00" means 9:00 at the restaurant, also when the laptop is elsewhere and across DST.
import { describe, expect, it } from 'vitest'
import { msToZoned, zonedToMs } from '../app/utils/when.ts'

describe('zonedToMs / msToZoned', () => {
  it.each([
    ['2026-10-14T09:00', 'Europe/Vienna', '2026-10-14T07:00:00.000Z'], // summer time, UTC+2
    ['2026-12-01T09:00', 'Europe/Vienna', '2026-12-01T08:00:00.000Z'], // winter time, UTC+1
    ['2026-10-25T09:00', 'Europe/Vienna', '2026-10-25T08:00:00.000Z'], // the morning after the switch
    ['2026-10-14T09:00', 'America/New_York', '2026-10-14T13:00:00.000Z'],
  ])('%s in %s is %s, and back', (local, zone, iso) => {
    const ms = zonedToMs(local, zone)!
    expect(new Date(ms).toISOString()).toBe(iso)
    expect(msToZoned(ms, zone)).toBe(local)
  })

  it('a malformed value is undefined, not a wrong time', () => {
    expect(zonedToMs('14.10.2026 09:00', 'Europe/Vienna')).toBeUndefined()
  })
})
