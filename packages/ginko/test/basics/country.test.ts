// Which public holidays count (SPEC templates T6). Wrong behaviour caught: the Studio, the reminder mail and the site
// disagree about a holiday because one of them guessed the calendar; a config without `country` silently changes a
// 0.4 site; an explicit calendar loses to the country.
import { describe, expect, it } from 'vitest'
import { hoursOn, type HoursContext } from '../../src/basics/index.ts'
import { checkSchema, checkSite, collection, defineSite, diffSchema, f, serializeSchema, type SiteInput } from '../../src/core/index.ts'

const base = defineSite({
  site: 'linde', name: 'Linde', url: 'https://linde.example', timeZone: 'Europe/Vienna', locales: ['en'], currency: 'EUR', pages: { home: '/' },
  bricks: { news: collection({ label: 'News', max: 10, order: 'manual', fields: { title: f.text('Title') } }) },
})
const site = (over: Pick<SiteInput, 'country' | 'calendar'>): SiteInput => ({ ...base, ...over })
const houseParty = (year: number) => [{ date: `${year}-03-03`, de: 'Hausfest', en: 'House party' }]

describe('schema.holidays', () => {
  it.each([
    // country, calendar, stored
    [undefined, undefined, undefined],
    ['AT', undefined, 'AT'],
    ['DE', undefined, 'DE'],
    ['SG', undefined, 'SG'],
    ['FR', undefined, 'none'],
    ['AT', 'DE', 'DE'],
    ['FR', 'none', 'none'],
    [undefined, 'SG', 'SG'],
    [undefined, houseParty, 'custom'],
    ['DE', houseParty, 'custom'],
  ] as const)('country %s with calendar %s stores %s', (country, calendar, stored) => {
    const schema = serializeSchema(site({ ...(country ? { country } : {}), ...(calendar ? { calendar } : {}) }))
    expect(schema.holidays).toBe(stored)
    expect('holidays' in schema).toBe(stored !== undefined)
    expect(checkSchema(schema)).toEqual([])
  })

  it('checkSchema refuses an unknown calendar, checkSite a malformed country or calendar', () => {
    expect(checkSchema({ ...serializeSchema(base), holidays: 'FR' })).toEqual(['holidays must be one of AT, DE, SG, none, custom.'])
    expect(checkSite(site({ country: 'at' }))).toEqual(['country: invalid country “at” (expected an ISO 3166-1 code such as “AT” or “DE”).'])
    expect(checkSite(site({ calendar: 'custom' as never }))).toEqual(['calendar: unknown calendar “custom” (expected AT, DE, SG, none or a function (year) => holidays).'])
  })

  it('a changed calendar is a release change that goes through', () => {
    const diff = diffSchema(serializeSchema(site({ country: 'AT' })), serializeSchema(site({ country: 'DE' })))
    expect(diff.rejected).toEqual([])
    expect(diff.changes.map((c) => c.path)).toEqual(['holidays'])
  })
})

describe('the basics hours rules pick the calendar (none without one)', () => {
  // A week open every day, so only the holiday rule can close it.
  const week = (['mo', 'tu', 'we', 'th', 'fr', 'sa', 'su'] as const).map((day) => ({ day, closed: false, from1: '09:00', to1: '17:00' }))
  const ctx = (over: Partial<HoursContext>): HoursContext => ({ hours: { week, exceptions: [], holidays: 'closed' }, ...over })
  // 26 Oct 2026 is the Austrian National Day, 3 Oct German Unity Day, 3 Mar the house party.
  it.each([
    // context, date, closed
    [{}, '2026-10-26', false],
    [{ country: '' }, '2026-10-26', false],
    [{ country: 'AT' }, '2026-10-26', true],
    [{ country: 'DE' }, '2026-10-26', false],
    [{ country: 'DE' }, '2026-10-03', true],
    [{ country: 'FR' }, '2026-10-26', false],
    [{ country: 'DE', calendar: 'AT' }, '2026-10-26', true],
    [{ country: 'AT', calendar: 'none' }, '2026-10-26', false],
    [{ country: 'AT', calendar: houseParty }, '2026-03-03', true],
  ] as const)('%o on %s', (over, date, closed) => {
    expect(hoursOn(ctx(over), date).closed).toBe(closed)
  })
})
