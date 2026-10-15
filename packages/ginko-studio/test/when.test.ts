// "Online ab 9:00" means 9:00 at the restaurant, also when the laptop is elsewhere and across DST.
import { createFormatters, createTranslator } from '@lupinum/ginko-i18n/core'
import { compileCatalogs } from '@lupinum/ginko-i18n/compile'
import { describe, expect, it } from 'vitest'
import server from '../../ginko-server/i18n/de.json'
import { textOf } from '../app/utils/textOf.ts'
import { msToZoned, whenFull, whenText, zonedTimes } from '../app/utils/when.ts'

describe('zonedTimes / msToZoned', () => {
  it.each([
    ['2026-10-14T09:00', 'Europe/Vienna', '2026-10-14T07:00:00.000Z'], // summer time, UTC+2
    ['2026-12-01T09:00', 'Europe/Vienna', '2026-12-01T08:00:00.000Z'], // winter time, UTC+1
    ['2026-10-25T09:00', 'Europe/Vienna', '2026-10-25T08:00:00.000Z'], // the morning after the switch
    ['2026-10-14T09:00', 'America/New_York', '2026-10-14T13:00:00.000Z'],
  ])('%s in %s is %s, and back', (local, zone, iso) => {
    const times = zonedTimes(local, zone)!
    expect(times.map((ms) => new Date(ms).toISOString())).toEqual([iso])
    expect(msToZoned(times[0]!, zone)).toBe(local)
  })

  // Wrong behaviour caught: the second 02:30 is taken without asking, and a 02:30 that never happens becomes 03:30.
  it('the hour the clocks go back has two times, the skipped hour none', () => {
    expect(zonedTimes('2026-10-25T02:30', 'Europe/Vienna')!.map((ms) => new Date(ms).toISOString())).toEqual(['2026-10-25T00:30:00.000Z', '2026-10-25T01:30:00.000Z'])
    expect(zonedTimes('2026-03-29T02:30', 'Europe/Vienna')).toEqual([])
  })

  it('a malformed value is undefined, not a wrong time', () => {
    expect(zonedTimes('14.10.2026 09:00', 'Europe/Vienna')).toBeUndefined()
  })
})

describe('whenText', () => {
  // Wrong behaviour caught: the toast says "2:30" and the history line "02:30" (or the other way round) for one time.
  it('a draft scheduled for 02:30 reads the same in the toast and in the history line', () => {
    const at = Date.UTC(2026, 9, 24, 0, 30) // 02:30 summer time in Vienna
    const messages = compileCatalogs({ de: { server } }).de
    const t = createTranslator({ messages, language: 'de', timeZone: 'UTC' }).t
    expect(whenText(at, 'Europe/Vienna', createFormatters('de'))).toBe('24. Okt., 02:30')
    expect(textOf({ key: 'history.scheduled', params: { title: 'X', at } }, '', { t, locale: 'de', timeZone: 'Europe/Vienna' })).toBe('Eintrag „X“: online ab 24. Okt., 02:30')
  })

  // Wrong behaviour caught: the second 02:30 of the night the clocks go back read "25. Okt., 02:30", like the first (regress-9).
  it.each([
    [Date.UTC(2026, 9, 25, 0, 30), '25. Okt., 02:30 MESZ', '25.10.2026, 02:30 MESZ'],
    [Date.UTC(2026, 9, 25, 1, 30), '25. Okt., 02:30 MEZ', '25.10.2026, 02:30 MEZ'],
    [Date.UTC(2026, 9, 25, 8, 0), '25. Okt., 09:00', '25.10.2026, 09:00'],
  ])('%i reads %s', (at, short, full) => {
    const format = createFormatters('de')
    expect([whenText(at, 'Europe/Vienna', format), whenFull(at, 'Europe/Vienna', format)]).toEqual([short, full])
  })
})
