// A change that comes back every year, and a name, on the platform (slice 4 of checkpoint 3): `entries.save` with
// `yearly` and `name`, a row that lives through the years (waits → holds → waits), its runs over three years on a mocked
// clock, the limits, the other doors, a request that holds both keys, and what the bundle serves. Next to
// dated-until.test.ts (slice 3), whose rules stay. Each test names the row of the paper's state table or its number.
import { dayStartIn, type Schema } from '@lupinum/ginko/internal'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { api, internal } from '../convex/_generated/api'
import type { Id } from '../convex/_generated/dataModel'
import * as bothHomes from '../../ginko/test/fixtures/both-homes-yearly'
import { errorOf, opId, people, setup } from './setup'

// Mail is the one thing mocked besides the clock. The table of number 1 is saved on this day, so the days of 2028 (a leap
// year) lie within a year.
const TODAY = bothHomes.savedOn
const NOW = Date.parse(`${TODAY}T10:00:00Z`)
/** The first minute of a day in the restaurant's zone. Sessions last 24 hours, so every write by a person happens today. */
const at = (day: string) => dayStartIn(day, 'Europe/Vienna')

type Money = { amount: number; currency?: string }
type Shown = { from: string; until?: string; name?: string; yearly?: true; data: Record<string, unknown> }
type Item = { id: string; data: { price: Money; onMenu?: boolean; veg?: string }; upcoming?: Shown[]; holding?: (Shown & { normal: Record<string, unknown> })[] }
type Proposed = { proposal: Id<'proposals'> }

/**
 * The restaurant on a fake clock: the menu's price may be read ahead; "Saisonpreis" asks both days, yearly and a name;
 * "Aktionspreis" asks both days only; "Heute nicht auf der Karte" is for today only.
 */
async function yearlySetup(opts: { needsApproval?: boolean } = {}) {
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
  vi.stubEnv('GINKO_MAIL', 'outbox')
  vi.stubEnv('SITE_URL', 'https://ginko.test')
  const s = await setup()
  const approval = opts.needsApproval ? { needsApproval: true } : {}
  await s.t.run(async (ctx) => {
    const schema = (await ctx.db.get(s.site))!.schema as Schema
    const menu = schema.bricks.menu! as { timeline?: { public: string[] }; tasks: unknown[] }
    menu.timeline = { public: ['price'] }
    menu.tasks.push(
      { id: 'season', label: 'Saisonpreis', kind: 'edit', pick: true, fields: ['price'], when: { from: 'ask', until: 'ask', yearly: 'ask', name: 'ask' }, ...approval },
      { id: 'offer', label: 'Aktionspreis', kind: 'edit', pick: true, fields: ['price'], when: { from: 'ask', until: 'ask' }, ...approval },
      { id: 'offToday', label: 'Heute nicht auf der Karte', kind: 'edit', pick: true, fields: [], when: { from: '@today', until: '@today' }, set: { onMenu: false } },
    )
    await ctx.db.patch(s.site, { schema })
    const cook = (await ctx.db.query('memberships').collect()).find((m) => m.user === people.cook)!
    await ctx.db.patch(cook._id, { grants: [...cook.grants, 'menu.season', 'menu.offer', 'menu.offToday'] })
  })
  const saibling = s.entries['menu-saibling']!
  const row = (id: Id<'entries'>) => s.t.run((ctx) => ctx.db.get(id))
  const dated = (entry: Id<'entries'>) => s.t.run((ctx) => ctx.db.query('datedChanges').withIndex('by_entry', (q) => q.eq('entry', entry)).collect())
  const history = (entry: Id<'entries'>) => s.t.run((ctx) => ctx.db.query('changes').withIndex('by_entry', (q) => q.eq('entry', entry)).collect())
  const contentRev = async () => (await s.t.run((ctx) => ctx.db.get(s.site)))!.contentRev
  const bundleText = async () => (await s.t.fetch('/bundle/restaurant?format=3&locale=de')).text()
  const bundle = async () => JSON.parse(await bundleText()) as { bricks: { menu: { items: Item[] }; hours: { data: { week: unknown } } } }
  const item = async (entry: Id<'entries'>): Promise<Item | undefined> => (await bundle()).bricks.menu.items.find((i) => i.id === entry)
  const shownPrice = async (entry: Id<'entries'>) => (await item(entry))?.data.price.amount
  /** The entry as it is stored: what a yearly change must never touch (number 3). */
  const stored = async (entry: Id<'entries'>) => {
    const e = (await row(entry))!
    return { data: e.data, rev: e.rev, fieldRevs: e.fieldRevs, prints: e.prints }
  }
  /** The runs still planned for the dated changes: number 4 counts them. */
  const planned = () => s.t.run(async (ctx) => (await ctx.db.system.query('_scheduled_functions').collect())
    .filter((j) => j.name.startsWith('datedChanges:') && j.state.kind === 'pending')
    .map((j) => ({ name: j.name, at: j.scheduledTime, args: j.args[0] as { change: string } })))
  /** The owner gives the saibling a price (cents) for every year from `from` to `until`. */
  const season = (amount: number, from: string, until: string, extra: Record<string, unknown> = {}) =>
    s.as.owner.mutation(api.entries.save, { site: 'restaurant', opId: opId(), entry: saibling, baseRev: 1, fields: { price: { amount } }, from, until, yearly: true, ...extra })
  /** The owner gives the saibling a price (cents) for one time. */
  const offer = (amount: number, from: string, until: string, extra: Record<string, unknown> = {}) =>
    s.as.owner.mutation(api.entries.save, { site: 'restaurant', opId: opId(), entry: saibling, baseRev: 1, fields: { price: { amount } }, from, until, ...extra })
  const list = () => s.as.owner.query(api.datedChanges.list, { site: 'restaurant', entry: saibling })
  const advanceTo = async (time: number) => {
    vi.advanceTimersByTime(time - Date.now())
    await s.t.finishInProgressScheduledFunctions()
  }
  return { ...s, saibling, row, dated, history, contentRev, bundleText, bundle, item, shownPrice, stored, planned, season, offer, list, advanceTo }
}

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
})

describe('a yearly save (state table: save, yearly on)', () => {
  // Row "days ahead". Wrong behaviour caught: the row loses `yearly` or the name, a field is written, or the page cannot
  // announce the days with the name.
  it('days ahead: a row with yearly and name, no field written, the page announces the days with both', async () => {
    const s = await yearlySetup()
    const before = await s.stored(s.saibling)
    await s.season(990, '2028-06-01', '2028-08-31', { name: 'Sommer' })
    const [row] = await s.dated(s.saibling)
    expect(row).toMatchObject({ from: '2028-06-01', until: '2028-08-31', yearly: true, name: 'Sommer', fields: { price: { amount: 990 } } })
    expect(row!.holds).toBeUndefined()
    expect(await s.stored(s.saibling)).toEqual(before)
    expect((await s.item(s.saibling))?.upcoming).toEqual([{ from: '2028-06-01', until: '2028-08-31', name: 'Sommer', yearly: true, data: { price: { amount: 990, currency: 'EUR' } } }])
  })

  // Row "today inside the days (from in the past)" and decision 3. Wrong behaviour caught: a season typed in the middle of
  // its days is refused (a start in the past) or waits a year; the page names the days of its first year.
  it('today inside the days, from a year back: holds at once, the page names this year\'s days', async () => {
    const s = await yearlySetup()
    const before = await s.stored(s.saibling)
    await s.season(990, '2026-10-01', '2026-10-31', { name: 'Herbst' })
    expect((await s.dated(s.saibling))[0]!.holds).toEqual(expect.any(Number))
    expect(await s.stored(s.saibling)).toEqual(before)
    expect(await s.item(s.saibling)).toMatchObject({
      data: { price: { amount: 990 } },
      holding: [{ from: '2027-10-01', until: '2027-10-31', name: 'Herbst', yearly: true, data: { price: { amount: 990, currency: 'EUR' } }, normal: { price: { amount: 1350, currency: 'EUR' } } }],
    })
  })

  // Row "both days in the past". Wrong behaviour caught: a season whose days have passed this year is refused, holds now,
  // or its start run is planned for a day that has passed (it would run at once).
  it('both days in the past: waits for next year, with its start run planned for next year\'s first day', async () => {
    const s = await yearlySetup()
    await s.season(990, '2027-06-01', '2027-08-31')
    const [row] = await s.dated(s.saibling)
    expect(row!.holds).toBeUndefined()
    expect(await s.planned()).toEqual([{ name: 'datedChanges:applyDue', at: at('2028-06-01'), args: expect.objectContaining({ change: row!._id }) }])
    expect(await s.shownPrice(s.saibling)).toBe(1350)
    expect((await s.item(s.saibling))?.upcoming).toEqual([{ from: '2028-06-01', until: '2028-08-31', yearly: true, data: { price: { amount: 990, currency: 'EUR' } } }])
  })

  // Row "a name only (not yearly)". Wrong behaviour caught: the name of a one-off change is dropped on the way to the page.
  it('a name without yearly: the row and the page carry the name', async () => {
    const s = await yearlySetup()
    await s.offer(700, TODAY, '2027-10-12', { name: 'Betriebsurlaub' })
    expect(await s.dated(s.saibling)).toMatchObject([{ name: 'Betriebsurlaub', holds: expect.any(Number) }])
    expect((await s.dated(s.saibling))[0]!.yearly).toBeUndefined()
    expect((await s.item(s.saibling))?.holding).toEqual([{ from: TODAY, until: '2027-10-12', name: 'Betriebsurlaub', data: { price: { amount: 700, currency: 'EUR' } }, normal: { price: { amount: 1350, currency: 'EUR' } } }])
  })

  // Limits of the paper. Wrong behaviour caught: a season one year long (it never ends, so it never starts again), one more
  // than a year back or ahead, a name that is empty or too long, or yearly or a name on a change without an end is stored.
  it.each<[string, Record<string, unknown>, string]>([
    ['yearly without an end', { from: '2028-06-01', yearly: true }, 'errors.yearlyNeedsUntil'],
    ['a name without an end', { from: '2028-06-01', name: 'Neu' }, 'errors.nameNeedsUntil'],
    ['yearly and one year long', { from: '2027-11-01', until: '2028-10-31', yearly: true }, 'errors.yearlyTooLong'],
    ['yearly from more than a year back', { from: '2026-10-07', until: '2026-10-31', yearly: true }, 'errors.dayTooFarBack'],
    ['yearly from more than a year ahead', { from: '2028-10-09', until: '2028-10-20', yearly: true }, 'errors.dayTooFarAhead'],
    ['a start in the past without yearly', { from: '2027-10-07', until: '2027-10-31' }, 'errors.dayBeforeToday'],
    ['a name of 61 characters', { from: '2028-06-01', until: '2028-06-10', name: 'x'.repeat(61) }, 'errors.nameLength'],
    ['an empty name', { from: '2028-06-01', until: '2028-06-10', name: '   ' }, 'errors.nameLength'],
  ])('refuses %s', async (_, args, key) => {
    const s = await yearlySetup()
    const before = await s.stored(s.saibling)
    expect(await errorOf(s.as.owner.mutation(api.entries.save, { site: 'restaurant', opId: opId(), entry: s.saibling, baseRev: 1, fields: { price: { amount: 990 } }, ...args }))).toMatchObject({ key })
    expect(await s.dated(s.saibling)).toEqual([])
    expect(await s.stored(s.saibling)).toEqual(before)
  })

  // Wrong behaviour caught: a name is stored with the spaces around it, so the page shows " Sommer ".
  it('stores the name trimmed', async () => {
    const s = await yearlySetup()
    await s.season(990, '2028-06-01', '2028-08-31', { name: '  Sommer ' })
    expect((await s.dated(s.saibling))[0]!.name).toBe('Sommer')
  })
})

describe('the same start and overlaps (state table)', () => {
  // Row "same start again", waits. Wrong behaviour caught: a second save of the same start makes a second row, or cannot
  // change the end, the name, yearly or the values.
  it('waits: the same start joins the row; end, name, yearly and values change', async () => {
    const s = await yearlySetup()
    await s.season(990, '2028-06-01', '2028-08-31', { name: 'Sommer' })
    const [row] = await s.dated(s.saibling)
    await s.offer(950, '2028-06-01', '2028-09-15', { name: 'Sommerkarte', change: row!._id })
    const rows = await s.dated(s.saibling)
    expect(rows).toMatchObject([{ _id: row!._id, from: '2028-06-01', until: '2028-09-15', name: 'Sommerkarte', fields: { price: { amount: 950 } } }])
    expect(rows[0]!.yearly).toBeUndefined()
  })

  // Row "same start again", holds. Wrong behaviour caught: switching yearly off while it holds passes (the paper keeps it:
  // "end only this year" is decision 2), or the end, name and values of a holding season cannot change; the new end does
  // not count for the next years.
  it('holds: end, name and values change for every year; yearly cannot be switched off', async () => {
    const s = await yearlySetup()
    await s.season(990, '2026-10-01', '2026-10-31')
    const [row] = await s.dated(s.saibling)
    expect(await errorOf(s.offer(950, '2027-10-01', '2027-11-15', { change: row!._id }))).toMatchObject({ key: 'errors.yearlyWhileHolding' })
    await s.season(950, '2027-10-01', '2027-11-15', { name: 'Herbst', change: row!._id })
    expect(await s.list()).toMatchObject([{ id: row!._id, from: '2027-10-01', until: '2027-11-15', yearly: true, name: 'Herbst', holds: true }])
    expect(await s.shownPrice(s.saibling)).toBe(950)
    await s.advanceTo(at('2028-11-10') + 1000)
    expect(await s.shownPrice(s.saibling)).toBe(950)
    await s.advanceTo(at('2028-11-16') + 1000)
    expect(await s.shownPrice(s.saibling)).toBe(1350)
  })

  // Row "tie". Wrong behaviour caught: a one-off change that starts on the first day of the season's next time, or a second
  // season from the same month and day, is stored for the same field (which would win?).
  it('refuses a tie with the current time of a season and names it', async () => {
    const s = await yearlySetup()
    await s.season(990, '2027-06-01', '2027-08-31', { name: 'Sommer' })
    expect(await errorOf(s.offer(800, '2028-06-01', '2028-06-10'))).toMatchObject({ key: 'errors.datedSameStart' })
    expect(await errorOf(s.season(800, '2028-06-01', '2028-07-31'))).toMatchObject({ key: 'errors.datedSameStart' })
    expect(await s.dated(s.saibling)).toHaveLength(1)
  })

  // Row "a one-off change inside the yearly days". Wrong behaviour caught: the closure inside the season is refused, or
  // loses to the season although it starts later.
  it('a one-off change inside the yearly days: both saved; the later start shows on its days', async () => {
    const s = await yearlySetup()
    await s.season(990, '2026-10-01', '2026-10-31')
    await s.offer(500, '2027-10-10', '2027-10-12', { name: 'Betriebsurlaub' })
    expect(await s.dated(s.saibling)).toHaveLength(2)
    await s.advanceTo(at('2027-10-10') + 1000)
    expect(await s.shownPrice(s.saibling)).toBe(500)
    await s.advanceTo(at('2027-10-13') + 1000)
    expect(await s.shownPrice(s.saibling)).toBe(990)
  })
})

describe('the runs over the years (state table: end run, start run)', () => {
  // Row "end run". Wrong behaviour caught: the end run drops the season (it never comes back), leaves it holding, writes
  // no history, keeps the website's old copy, or plans no next start.
  it('the end run keeps the row: holds cleared, a history line, the website told, the next start planned', async () => {
    const s = await yearlySetup()
    await s.season(990, '2026-10-01', '2026-10-31', { name: 'Herbst' })
    const [row] = await s.dated(s.saibling)
    const rev = await s.contentRev()
    await s.advanceTo(at('2027-11-01') + 1000)
    const rows = await s.dated(s.saibling)
    expect(rows.map((r) => [r._id, r.holds])).toEqual([[row!._id, undefined]])
    expect(await s.shownPrice(s.saibling)).toBe(1350)
    expect(await s.contentRev()).toBe(rev + 1)
    expect((await s.history(s.saibling)).at(-1)).toMatchObject({ kind: 'datedEnded', actor: 'system', msg: { key: 'history.datedEndedYearly' } })
    expect(await s.planned()).toEqual([{ name: 'datedChanges:applyDue', at: at('2028-10-01'), args: expect.objectContaining({ change: row!._id }) }])
    expect((await s.item(s.saibling))?.upcoming).toEqual([{ from: '2028-10-01', until: '2028-10-31', name: 'Herbst', yearly: true, data: { price: { amount: 990, currency: 'EUR' } } }])
  })

  // Wrong behaviour caught: the start run of the next year does not come, comes without a check, or writes no history.
  it('the start run a year later lets it hold again, with a history line', async () => {
    const s = await yearlySetup()
    await s.season(990, '2026-10-01', '2026-10-31', { name: 'Herbst' })
    await s.advanceTo(at('2028-10-01') - 60_000)
    expect(await s.shownPrice(s.saibling)).toBe(1350)
    await s.advanceTo(at('2028-10-01') + 1000)
    expect(await s.shownPrice(s.saibling)).toBe(990)
    expect((await s.history(s.saibling)).at(-1)).toMatchObject({ kind: 'datedStarted', actor: 'system', msg: { key: 'history.datedStartedYearly' } })
  })

  // Number 4. Wrong behaviour caught: each year makes a new row, or each run plans one more run, so rows or runs pile up.
  it('number 4: after three years of runs, exactly 1 row and 1 planned run', async () => {
    const s = await yearlySetup()
    await s.season(990, '2027-12-01', '2028-01-31', { name: 'Winter' })
    for (const day of ['2027-12-01', '2028-02-01', '2028-12-01', '2029-02-01', '2029-12-01', '2030-02-01', '2030-12-01']) {
      await s.advanceTo(at(day) + 1000)
      expect([day, await s.shownPrice(s.saibling)]).toEqual([day, day.endsWith('12-01') ? 990 : 1350])
    }
    const rows = await s.dated(s.saibling)
    expect(rows).toHaveLength(1)
    expect(await s.planned()).toEqual([{ name: 'datedChanges:endDue', at: at('2031-02-01'), args: expect.objectContaining({ change: rows[0]!._id }) }])
  })

  // Number 3. Wrong behaviour caught: a start or end run of some year writes the season's value into the entry (it would
  // stay after the end, or a normal edit would conflict with it).
  it('number 3: fields written into the entry by a yearly change over two full years: 0', async () => {
    const s = await yearlySetup()
    const before = await s.stored(s.saibling)
    await s.season(990, '2026-10-01', '2026-10-31')
    for (const day of ['2027-11-01', '2028-10-01', '2028-11-01', '2029-10-01', '2029-11-01']) {
      await s.advanceTo(at(day) + 1000)
      expect([day, await s.stored(s.saibling)]).toEqual([day, before])
    }
  })

  // Number 5 and row "start run a year later fails its checks". Wrong behaviour caught: a season that failed its checks
  // shows anyway, fails silently, or tries again by itself the next year.
  it('number 5: a stopped yearly row shows on 0 days, also the next year', async () => {
    const s = await yearlySetup()
    await s.season(990, '2027-12-01', '2028-01-31')
    const [row] = await s.dated(s.saibling)
    await s.t.run((ctx) => ctx.db.patch(row!._id, { fields: { price: { amount: -5 } } }))
    for (const day of ['2027-12-01', '2028-01-15', '2028-12-01', '2029-01-15']) {
      await s.advanceTo(at(day) + 1000)
      expect([day, await s.shownPrice(s.saibling)]).toEqual([day, 1350])
    }
    expect((await s.dated(s.saibling))[0]).toMatchObject({ stopped: { reason: { code: 'invalid' } } })
    expect(await s.planned()).toEqual([])
    expect((await s.t.run((ctx) => ctx.db.query('outbox').collect())).map((m) => m.to)).toEqual(['wirtin@example.com'])
  })

  // Row "start run on an entry that is not online" (as slice 3), in a later year. Wrong behaviour caught: the season holds
  // again on an entry that went offline since its last time.
  it('a start run a year later on an entry that is not online stops the row', async () => {
    const s = await yearlySetup()
    await s.season(990, '2026-10-01', '2026-10-31')
    await s.advanceTo(at('2027-11-01') + 1000)
    await s.t.run((ctx) => ctx.db.patch(s.saibling, { state: 'draft' }))
    await s.advanceTo(at('2028-10-01') + 1000)
    const [row] = await s.dated(s.saibling)
    expect([row!.holds, row!.stopped?.reason]).toEqual([undefined, { code: 'invalid', fields: ['price'], cause: { key: 'errors.exceptionNotOnline' } }])
  })
})

describe('numbers 1 (state table: both homes)', () => {
  // Number 1: the platform read against the table both homes share (the file read: ginko-content/test/changes.test.ts).
  it('the platform read gives the values of the table on every day', async () => {
    const s = await yearlySetup()
    await s.t.run(async (ctx) => {
      const e = (await ctx.db.get(s.saibling))!
      await ctx.db.patch(s.saibling, { data: { ...(e.data as object), ...bothHomes.stored } })
    })
    for (const c of bothHomes.changes) {
      await s.as.owner.mutation(api.entries.save, {
        site: 'restaurant', opId: opId(), entry: s.saibling, baseRev: 1, fields: c.set, from: c.from,
        ...(c.until ? { until: c.until } : {}), ...(c.yearly ? { yearly: true } : {}), ...(c.name ? { name: c.name } : {}),
      })
    }
    const seen: [string, number, boolean][] = []
    for (const [day] of bothHomes.days) {
      await s.advanceTo(at(day) + 1000)
      const shown = await s.item(s.saibling)
      seen.push([day, shown!.data.price.amount, shown!.data.onMenu ?? true])
    }
    expect(seen).toEqual(bothHomes.days)
  })

  // The paper's proof of a rows field. Wrong behaviour caught: the summer week of the opening hours does not come back the
  // next year, or stays after its end.
  it('a yearly change of a rows field (the week) holds every year and ends every year', async () => {
    const s = await yearlySetup()
    const hours = s.entries.hours!
    const normal = ((await s.row(hours))!.data as { week: Record<string, unknown> }).week
    const summer = { ...normal, mo: { closed: false, from1: '10:00', to1: '23:00' } }
    await s.as.owner.mutation(api.entries.save, { site: 'restaurant', opId: opId(), entry: hours, baseRev: 1, fields: { week: summer }, from: '2028-06-01', until: '2028-08-31', yearly: true, name: 'Sommer' })
    for (const [day, week] of [['2028-06-01', summer], ['2028-09-01', normal], ['2029-06-01', summer], ['2029-09-01', normal]] as const) {
      await s.advanceTo(at(day) + 1000)
      expect([day, (await s.bundle()).bricks.hours.data.week]).toEqual([day, week])
    }
  })
})

describe('moving and removing (state table: Tage ändern, Änderung aufheben)', () => {
  // Row "Tage ändern", waits. Wrong behaviour caught: a move drops `yearly`, or skips the limits of a season.
  it('a waiting season moves both days and stays yearly', async () => {
    const s = await yearlySetup()
    await s.season(990, '2028-06-01', '2028-08-31')
    const [row] = await s.dated(s.saibling)
    await s.as.owner.mutation(api.datedChanges.setDay, { site: 'restaurant', opId: opId(), change: row!._id, from: '2028-06-15', until: '2028-09-15' })
    expect(await s.dated(s.saibling)).toMatchObject([{ from: '2028-06-15', until: '2028-09-15', yearly: true }])
    expect(await errorOf(s.as.owner.mutation(api.datedChanges.setDay, { site: 'restaurant', opId: opId(), change: row!._id, from: '2028-06-15', until: '2029-06-15' }))).toMatchObject({ key: 'errors.yearlyTooLong' })
  })

  // Row "Tage ändern", holds. Wrong behaviour caught: the start of a holding season moves, or the new end counts only for
  // this year.
  it('a holding season moves only its end, and the new end counts for every year', async () => {
    const s = await yearlySetup()
    await s.season(990, '2026-10-01', '2026-10-31')
    const [row] = await s.dated(s.saibling)
    const move = (from: string, until: string) => s.as.owner.mutation(api.datedChanges.setDay, { site: 'restaurant', opId: opId(), change: row!._id, from, until })
    expect(await errorOf(move('2027-10-02', '2027-11-15'))).toMatchObject({ key: 'errors.holdingFromFixed' })
    await move('2027-10-01', '2027-11-15')
    await s.advanceTo(at('2027-11-16') + 1000)
    expect((await s.item(s.saibling))?.upcoming).toEqual([{ from: '2028-10-01', until: '2028-11-15', yearly: true, data: { price: { amount: 990, currency: 'EUR' } } }])
  })

  // Row "Änderung aufheben", holds, and decision 2. Wrong behaviour caught: removing a holding season only ends this
  // year's time (it comes back), leaves it on the website until a later refresh, or keeps its planned run.
  it('"Änderung aufheben" on a holding season drops it for good: the page shows the normal value at once', async () => {
    const s = await yearlySetup()
    await s.season(990, '2026-10-01', '2026-10-31')
    const [row] = await s.dated(s.saibling)
    const rev = await s.contentRev()
    await s.as.owner.mutation(api.datedChanges.cancel, { site: 'restaurant', opId: opId(), change: row!._id })
    expect(await s.dated(s.saibling)).toEqual([])
    expect(await s.planned()).toEqual([])
    expect(await s.shownPrice(s.saibling)).toBe(1350)
    expect(await s.contentRev()).toBe(rev + 1)
    expect((await s.history(s.saibling)).at(-1)).toMatchObject({ kind: 'datedCancelled', msg: { key: 'history.datedCancelled' } })
  })

  // What the editor shows. Wrong behaviour caught: the list names the days of the first year, so the notice says "bis
  // 31. Okt. 2026" in 2027, or loses the name and yearly.
  it('the list names the days of the current or next time, with yearly and the name', async () => {
    const s = await yearlySetup()
    await s.season(990, '2026-10-01', '2026-10-31', { name: 'Herbst' })
    await s.season(900, '2027-06-01', '2027-08-31')
    expect((await s.list()).map((r) => [r.from, r.until, r.yearly, r.name ?? null, r.holds])).toEqual([
      ['2027-10-01', '2027-10-31', true, 'Herbst', true],
      ['2028-06-01', '2028-08-31', true, null, false],
    ])
  })
})

describe('task keys on the server (state table: another door)', () => {
  // Rule from slice 3: decide by the task, not by which arguments came along. Wrong behaviour caught: staff make a
  // one-off offer come back every year, or give it a name, through a task that does not ask for it; a season task saves
  // without its end.
  it.each<[string, string, Record<string, unknown>, string]>([
    ['yearly through a task that does not ask for it', 'menu.offer', { from: '2028-06-01', until: '2028-08-31', yearly: true }, 'errors.taskCannotYearly'],
    ['a name through a task that does not ask for it', 'menu.offer', { from: '2028-06-01', until: '2028-08-31', name: 'Sommer' }, 'errors.taskCannotName'],
    ['a name through a today-only task', 'menu.offToday', { fields: {}, from: TODAY, until: TODAY, name: 'Heute' }, 'errors.taskCannotName'],
    ['yearly without its end through the season task', 'menu.season', { from: '2028-06-01', yearly: true }, 'errors.taskNeedsDays'],
  ])('refuses %s', async (_, task, args, key) => {
    const s = await yearlySetup()
    const before = await s.stored(s.saibling)
    expect(await errorOf(s.as.cook.mutation(api.entries.save, { site: 'restaurant', opId: opId(), task, entry: s.saibling, baseRev: 1, fields: { price: { amount: 990 } }, ...args }))).toMatchObject({ key })
    expect(await s.dated(s.saibling)).toEqual([])
    expect(await s.stored(s.saibling)).toEqual(before)
  })

  it('the season task saves yearly and a name', async () => {
    const s = await yearlySetup()
    await s.as.cook.mutation(api.entries.save, { site: 'restaurant', opId: opId(), task: 'menu.season', entry: s.saibling, baseRev: 1, fields: { price: { amount: 990 } }, from: '2028-06-01', until: '2028-08-31', yearly: true, name: 'Sommer' })
    expect(await s.dated(s.saibling)).toMatchObject([{ yearly: true, name: 'Sommer', by: people.cook }])
  })
})

describe('a request that holds yearly and a name (state table: the person needs a yes)', () => {
  // Wrong behaviour caught: the request loses yearly or the name (the yes makes a one-off change), or a yes after this
  // year's end is refused as stale although the season comes back.
  it('the request holds days, yearly and name; a yes after this year\'s end makes a row that waits for next year', async () => {
    const s = await yearlySetup({ needsApproval: true })
    const sent = await s.as.cook.mutation(api.entries.save, { site: 'restaurant', opId: opId(), task: 'menu.season', entry: s.saibling, baseRev: 1, fields: { price: { amount: 990 } }, from: '2027-10-09', until: '2027-10-20', yearly: true, name: 'Kürbiswochen' }) as unknown as Proposed
    expect(await s.as.cook.query(api.proposals.ownFor, { site: 'restaurant', entry: s.saibling })).toMatchObject({ from: '2027-10-09', until: '2027-10-20', yearly: true, name: 'Kürbiswochen' })
    await s.advanceTo(at('2027-10-25') + 3600_000)
    expect((await s.as.owner.query(api.proposals.get, { site: 'restaurant', proposal: sent.proposal }))?.conflictMsg).toBeNull()
    expect(await s.as.owner.mutation(api.proposals.approve, { proposal: sent.proposal })).not.toMatchObject({ status: 'stale' })
    expect(await s.dated(s.saibling)).toMatchObject([{ yearly: true, name: 'Kürbiswochen', by: people.cook }])
    expect((await s.item(s.saibling))?.upcoming).toMatchObject([{ from: '2028-10-09', until: '2028-10-20', yearly: true, name: 'Kürbiswochen' }])
  })
})

describe('the bundle and export (state table: export, import, file form)', () => {
  // Keep: the platform read without a yearly row on the page gives byte for byte what it gave before. Wrong behaviour
  // caught: a waiting season of a field outside timeline.public changes what a page gets.
  it('a waiting season of a private field leaves the bundle as it was, byte for byte', async () => {
    const s = await yearlySetup()
    const before = await s.bundleText()
    await s.as.owner.mutation(api.entries.save, { site: 'restaurant', opId: opId(), entry: s.saibling, baseRev: 1, fields: { veg: 'vegan' }, from: '2028-06-01', until: '2028-08-31', yearly: true, name: 'Sommer' })
    expect(await s.bundleText()).toBe(before)
  })

  // Wrong behaviour caught: a backup loses yearly or the name (the season would come back as a one-off change), or an
  // import drops a season whose first time has passed.
  it('a backup carries yearly and name; an import holds a season whose days are today and plans one that has passed', async () => {
    const s = await yearlySetup()
    await s.season(990, '2028-06-01', '2028-08-31', { name: 'Sommer' })
    const snapshot = await s.t.query(internal.backup.snapshot, { site: s.site })
    expect(snapshot.entries.find((e) => e.id === s.saibling)).toMatchObject({ changes: [{ from: '2028-06-01', until: '2028-08-31', yearly: true, name: 'Sommer', set: { price: { amount: 990 } } }] })

    vi.stubEnv('GINKO_LOCAL', '1')
    const dish = { category: 'starters', name: { de: 'Forelle' }, price: { amount: 1200 }, allergens: ['D'], veg: 'none' }
    await s.t.mutation(internal.seed.importExport, {
      site: 'restaurant', files: [],
      entries: [{ id: 'm1', brick: 'menu', kind: 'item', order: 99, prints: {}, rev: 1, data: dish, changes: [
        { from: '2026-10-01', until: '2026-10-31', yearly: true, name: 'Herbst', set: { price: { amount: 1000 } } },
        { from: '2027-06-01', until: '2027-08-31', yearly: true, set: { price: { amount: 1100 } } },
        { from: '2027-09-01', until: '2027-09-30', set: { price: { amount: 900 } } },
      ] }],
    })
    const menu = await s.t.run((ctx) => ctx.db.query('entries').withIndex('by_site_brick_order', (q) => q.eq('site', s.site).eq('brick', 'menu')).collect())
    const trout = menu.find((e) => (e.data as { name: { de: string } }).name.de === 'Forelle')!
    const rows = await s.dated(trout._id)
    expect(rows.map((r) => [r.from, r.yearly ?? false, r.name ?? null, r.holds !== undefined])).toEqual([['2026-10-01', true, 'Herbst', true], ['2027-06-01', true, null, false]])
    expect(await s.shownPrice(trout._id)).toBe(1000)
  })
})
