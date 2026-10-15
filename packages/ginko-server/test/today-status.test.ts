// The status lines of Today (UI.md 3, `status` on a brick): what sites.today says per brick and when a section is due.
import type { Json } from '@lupinum/ginko'
import type { Schema } from '@lupinum/ginko/internal'
import { describe, expect, it, vi } from 'vitest'
import { api } from '../convex/_generated/api'
import { setup } from './setup'

type Backend = Awaited<ReturnType<typeof setup>>
type Row = { data: Record<string, Json>; state?: 'draft'; publishAt?: number; createdBy?: string }

/** Sets `status` on bricks of the stored schema (`null` removes it, other keys are merged into the brick). */
async function patchBricks(s: Backend, bricks: Record<string, Record<string, unknown>>) {
  await s.t.run(async (ctx) => {
    const site = (await ctx.db.get(s.site))!
    const schema = structuredClone(site.schema) as Schema
    for (const [key, over] of Object.entries(bricks)) Object.assign(schema.bricks[key]!, over)
    await ctx.db.patch(s.site, { schema })
  })
}

/** Replaces the entries of a brick with `rows`. */
async function replaceEntries(s: Backend, brick: string, rows: Row[]) {
  await s.t.run(async (ctx) => {
    for (const e of await ctx.db.query('entries').withIndex('by_site_brick_order', (q) => q.eq('site', s.site).eq('brick', brick)).collect()) await ctx.db.delete(e._id)
    for (const [i, row] of rows.entries()) {
      await ctx.db.insert('entries', { site: s.site, brick, kind: 'item', order: i + 1, rev: 1, fieldRevs: {}, lifeRev: 1, prints: {}, bytes: 10, ...row })
    }
  })
}

const event = (title: string, from: string, to = from, extra: Record<string, Json> = {}): Row => ({
  data: { title: { de: title, en: title }, slug: { de: title.toLowerCase(), en: title.toLowerCase() }, when: { from, to }, description: { de: 'Text', en: 'Text' }, image: { file: 'f1', alt: { de: 'Bild' } }, ...extra },
})
const notice = (text: string, until?: string): Row => ({ data: { text: { de: text }, ...(until ? { until } : {}) } })

describe('sites.today', () => {
  // Wrong behaviour caught: a status says the wrong thing, a section is due when nothing needs doing (the button
  // shouts for no reason) or not due when something does (an event goes out without its English text, a job ad
  // expires unnoticed). Today is Thursday 2026-10-08 in Vienna unless a row sets another day; "within 7 days" is
  // today and the six days after it.
  it.each<[string, { now?: string; bricks: Record<string, Record<string, unknown>>; entries: [string, Row[]] }, { brick: string; line: unknown; due: boolean } | undefined]>([
    ['next: the first event that has not ended, ready', { bricks: { events: { status: { next: 'when' } } }, entries: ['events', [event('Ball', '2026-11-01'), event('Lesung', '2026-10-11'), event('Vorbei', '2026-10-01', '2026-10-07')]] },
      { brick: 'events', line: { kind: 'next', title: 'Lesung', date: '2026-10-11' }, due: false }],
    ['next: an event still running counts with its first day', { bricks: { events: { status: { next: 'when' } } }, entries: ['events', [event('Lesung', '2026-10-11'), event('Woche', '2026-10-06', '2026-10-09')]] },
      { brick: 'events', line: { kind: 'next', title: 'Woche', date: '2026-10-06' }, due: false }],
    ['next: within 7 days and the English description is empty', { bricks: { events: { status: { next: 'when' } } }, entries: ['events', [event('Lesung', '2026-10-14', '2026-10-14', { description: { de: 'Text' } })]] },
      { brick: 'events', line: { kind: 'next', title: 'Lesung', date: '2026-10-14' }, due: true }],
    ['next: 7 days ahead is outside the window', { bricks: { events: { status: { next: 'when' } } }, entries: ['events', [event('Lesung', '2026-10-15', '2026-10-15', { description: { de: 'Text' } })]] },
      { brick: 'events', line: { kind: 'next', title: 'Lesung', date: '2026-10-15' }, due: false }],
    ['next: nothing ahead shows no line', { bricks: { events: { status: { next: 'when' } } }, entries: ['events', [event('Vorbei', '2026-10-01')]] }, undefined],
    ['count: one notice ends on the sixth day after today', { bricks: { notices: { status: { count: true } } }, entries: ['notices', [notice('Bald', '2026-10-14'), notice('Später', '2026-10-15'), notice('Ohne Ende'), notice('Abgelaufen', '2026-10-07')]] },
      { brick: 'notices', line: { kind: 'count', ending: 1, online: 3 }, due: true }],
    ['count: none ends within 7 days', { bricks: { notices: { status: { count: true } } }, entries: ['notices', [notice('Später', '2026-10-15')]] },
      { brick: 'notices', line: { kind: 'count', ending: 0, online: 1 }, due: false }],
    ['missing: one event without an image, drafts left out', { bricks: { events: { status: { missing: 'image' }, drafts: true } }, entries: ['events', [event('Ball', '2026-11-01'), event('Lesung', '2026-10-11', '2026-10-11', { image: null }), { ...event('Entwurf', '2026-12-01', '2026-12-01', { image: null }), state: 'draft' }]] },
      { brick: 'events', line: { kind: 'missing', count: 1, field: 'image' }, due: true }],
    ['missing: every event has one', { bricks: { events: { status: { missing: 'image' } } }, entries: ['events', [event('Ball', '2026-11-01')]] },
      { brick: 'events', line: { kind: 'missing', count: 0, field: 'image' }, due: false }],
    ['age: the newest event is 18 days old', { bricks: { events: { status: { age: 'when' } } }, entries: ['events', [event('Alt', '2026-08-01'), event('Neu', '2026-09-20')]] },
      { brick: 'events', line: { kind: 'age', title: 'Neu', date: '2026-09-20', weeks: 2 }, due: false }],
    ['age: under 7 days is this week', { bricks: { events: { status: { age: 'when' } } }, entries: ['events', [event('Neu', '2026-10-02')]] },
      { brick: 'events', line: { kind: 'age', title: 'Neu', date: '2026-10-02', weeks: 0 }, due: false }],
    ['drafts without a status: drafts and scheduled', { bricks: { events: { drafts: true } }, entries: ['events', [event('Ball', '2026-11-01'), { ...event('Entwurf', '2026-12-01'), state: 'draft' }, { ...event('Geplant', '2026-12-02'), state: 'draft', publishAt: Date.parse('2026-10-20T08:00:00Z') }]] },
      { brick: 'events', line: { kind: 'drafts', drafts: 1, scheduled: 1 }, due: false }],
    ['week stale: the lunch week of the coming Monday is not entered', { now: '2026-10-12T10:00:00Z', bricks: {}, entries: ['lunchPlans', []] },
      { brick: 'lunch', line: null, due: true }],
  ])('%s', async (_name, given, expected) => {
    if (given.now) vi.setSystemTime(Date.parse(given.now))
    const s = await setup()
    await patchBricks(s, given.bricks)
    await replaceEntries(s, ...given.entries)
    const states = await s.as.owner.query(api.sites.today, { site: 'restaurant' })
    const brick = expected?.brick ?? Object.keys(given.bricks)[0]
    expect(states.find((x) => x.brick === brick)).toEqual(expected)
  })

  // Wrong behaviour caught: the owner reads "open" on a day the site is closed (a closure, a public holiday of the
  // stored calendar), the reason is lost, a day with no hours entered is not due, or the line ignores the stored
  // `holidays` and counts Austrian holidays for a site that set none. 2026-10-26 is the Austrian National Day (a Monday).
  const week = (days: string[]) => ['mo', 'tu', 'we', 'th', 'fr', 'sa', 'su'].filter((d) => days.includes(d)).map((day) => ({ _id: day, day, closed: false, from1: '11:30', to1: '14:30' }))
  const allWeek = week(['mo', 'tu', 'we', 'th', 'fr', 'sa', 'su'])
  it.each<[string, { now?: string; holidays?: string; data: Record<string, Json> }, { line: unknown; due: boolean }]>([
    ['open today', { data: { week: allWeek, exceptions: [] } }, { line: { kind: 'hours', today: { ranges: [['11:30', '14:30']] } }, due: false }],
    ['closed today with the owner\'s reason', { data: { week: allWeek, exceptions: [], closedOn: '2026-10-08', closedNote: 'Wasserrohrbruch' } }, { line: { kind: 'hours', today: { closed: true, reason: 'Wasserrohrbruch' } }, due: false }],
    ['closed on a public holiday of the stored calendar', { now: '2026-10-26T10:00:00Z', data: { week: allWeek, exceptions: [], holidays: 'closed' } },
      { line: { kind: 'hours', today: { closed: true, reason: { de: 'Nationalfeiertag', en: 'Austrian National Day' } } }, due: false }],
    ['open on that day when the site stores no holidays', { now: '2026-10-26T10:00:00Z', holidays: 'none', data: { week: allWeek, exceptions: [], holidays: 'closed' } },
      { line: { kind: 'hours', today: { ranges: [['11:30', '14:30']] } }, due: false }],
    ['no hours entered for today is due', { data: { week: week(['mo', 'tu']), exceptions: [] } }, { line: { kind: 'hours', today: { unknown: true } }, due: true }],
  ])('hours: %s', async (_name, given, expected) => {
    if (given.now) vi.setSystemTime(Date.parse(given.now))
    const s = await setup()
    if (given.holidays) {
      await s.t.run(async (ctx) => {
        const site = (await ctx.db.get(s.site))!
        await ctx.db.patch(s.site, { schema: { ...(site.schema as Schema), holidays: given.holidays as Schema['holidays'] } })
      })
    }
    await replaceEntries(s, 'hours', [{ data: given.data }])
    await replaceEntries(s, 'hourPlans', [])
    const states = await s.as.owner.query(api.sites.today, { site: 'restaurant' })
    expect(states.find((x) => x.brick === 'hours')).toEqual({ brick: 'hours', ...expected })
  })

  // Wrong behaviour caught: staff see the state of areas they have no task on, or other people's drafts.
  it('gives staff only the bricks they have a task on, and only their own drafts', async () => {
    const s = await setup()
    await patchBricks(s, { menu: { drafts: true }, notices: { status: { count: true } } })
    const dish = (name: string, createdBy?: string): Row => ({ data: { category: 'Hauptspeisen', name: { de: name }, price: { amount: 1000 } }, state: 'draft', ...(createdBy ? { createdBy } : {}) })
    await replaceEntries(s, 'menu', [dish('Vom Koch', 'u-koch'), dish('Von der Wirtin')])
    const cook = await s.as.cook.query(api.sites.today, { site: 'restaurant' })
    expect(cook.map((x) => x.brick)).not.toContain('notices')
    expect(cook.find((x) => x.brick === 'menu')?.line).toEqual({ kind: 'drafts', drafts: 1, scheduled: 0 })
    const owner = await s.as.owner.query(api.sites.today, { site: 'restaurant' })
    expect(owner.find((x) => x.brick === 'menu')?.line).toEqual({ kind: 'drafts', drafts: 2, scheduled: 0 })
  })
})
