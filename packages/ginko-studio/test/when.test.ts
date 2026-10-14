// "Online ab 9:00" means 9:00 at the restaurant, also when the laptop is elsewhere and across DST.
import { createFormatters, createTranslator } from '@lupinum/ginko-i18n/core'
import { compileCatalogs } from '@lupinum/ginko-i18n/compile'
import { describe, expect, it } from 'vitest'
import server from '../../ginko-server/i18n/de.json'
import { textOf } from '../app/utils/textOf.ts'
import { msToZoned, whenText, zonedToMs } from '../app/utils/when.ts'

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

describe('whenText', () => {
  // Wrong behaviour caught: the toast says "2:30" and the history line "02:30" (or the other way round) for one time.
  it('a draft scheduled for 02:30 reads the same in the toast and in the history line', () => {
    const at = Date.UTC(2026, 9, 24, 0, 30) // 02:30 summer time in Vienna
    const messages = compileCatalogs({ de: { server } }).de
    const t = createTranslator({ messages, language: 'de', timeZone: 'UTC' }).t
    expect(whenText(at, 'Europe/Vienna', createFormatters('de'))).toBe('24. Okt., 02:30')
    expect(textOf({ key: 'history.scheduled', params: { title: 'X', at } }, '', { t, locale: 'de', timeZone: 'Europe/Vienna' })).toBe('Eintrag „X“: online ab 24. Okt., 02:30')
  })
})
