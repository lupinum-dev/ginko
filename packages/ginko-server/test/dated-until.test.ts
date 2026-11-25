// A change with an end on the platform (slice 3 of checkpoint 3): `entries.save` with `from` and `until`, the start run
// at the first minute of `from` that lets it hold, the end run after `until` that drops it, moving, ending early, a
// request that holds both days, and what the bundle serves. Next to dated.test.ts (changes without an end), whose
// rules stay. Each test names the row of the paper's state table or the number it stands for.
import { dayStartIn, type Schema } from '@lupinum/ginko/internal'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { api, internal } from '../convex/_generated/api'
import type { Id } from '../convex/_generated/dataModel'
import * as bothHomes from '../../ginko/test/fixtures/both-homes'
import { errorOf, opId, people, setup } from './setup'

// Mail is the one thing mocked besides the clock.
const NOW = Date.parse('2026-10-08T10:00:00Z')
const TODAY = '2026-10-08'
/** The first minute of a day in the restaurant's zone. Sessions last 24 hours, so every write happens on 8 October. */
const at = (day: string) => dayStartIn(day, 'Europe/Vienna')

type Money = { amount: number; currency?: string }
type Item = { id: string; data: { price: Money; onMenu?: boolean; veg?: string }; upcoming?: { from: string; until?: string; data: Record<string, unknown> }[]; holding?: { from: string; until: string; data: Record<string, unknown>; normal: Record<string, unknown> }[] }
type Proposed = { proposal: Id<'proposals'> }

/**
 * The restaurant on a fake clock: the menu's price may be read ahead, "Aktionspreis" asks both days, "Heute nicht auf der
 * Karte" sets `onMenu: false` for today only, and the price task asks one day (as built).
 */
async function untilSetup(opts: { needsApproval?: boolean } = {}) {
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
  vi.stubEnv('GINKO_MAIL', 'outbox')
  vi.stubEnv('SITE_URL', 'https://ginko.test')
  const s = await setup()
  await s.t.run(async (ctx) => {
    const schema = (await ctx.db.get(s.site))!.schema as Schema
    const menu = schema.bricks.menu! as { timeline?: { public: string[] }; tasks: unknown[] }
    menu.timeline = { public: ['price'] }
    for (const task of schema.bricks.menu!.tasks ?? []) if (task.id === 'price') (task as { when?: unknown }).when = { from: 'ask' }
    menu.tasks.push(
      { id: 'offer', label: 'Aktionspreis', kind: 'edit', pick: true, fields: ['price'], when: { from: 'ask', until: 'ask' }, ...(opts.needsApproval ? { needsApproval: true } : {}) },
      { id: 'offToday', label: 'Heute nicht auf der Karte', kind: 'edit', pick: true, fields: [], when: { from: '@today', until: '@today' }, set: { onMenu: false }, ...(opts.needsApproval ? { needsApproval: true } : {}) },
    )
    await ctx.db.patch(s.site, { schema })
    const cook = (await ctx.db.query('memberships').collect()).find((m) => m.user === people.cook)!
    await ctx.db.patch(cook._id, { grants: [...cook.grants, 'menu.offer', 'menu.offToday'] })
  })
  const saibling = s.entries['menu-saibling']!
  const row = (id: Id<'entries'>) => s.t.run((ctx) => ctx.db.get(id))
  const dated = (entry: Id<'entries'>) => s.t.run((ctx) => ctx.db.query('datedChanges').withIndex('by_entry', (q) => q.eq('entry', entry)).collect())
  const history = (entry: Id<'entries'>) => s.t.run((ctx) => ctx.db.query('changes').withIndex('by_entry', (q) => q.eq('entry', entry)).collect())
  const contentRev = async () => (await s.t.run((ctx) => ctx.db.get(s.site)))!.contentRev
  const bundleText = async () => (await s.t.fetch('/bundle/restaurant?format=3&locale=de')).text()
  const item = async (entry: Id<'entries'>): Promise<Item | undefined> => (JSON.parse(await bundleText()) as { bricks: { menu: { items: Item[] } } }).bricks.menu.items.find((i) => i.id === entry)
  const shownPrice = async (entry: Id<'entries'>) => (await item(entry))?.data.price.amount
  /** The entry as it is stored: what an exception must never touch (number 2). */
  const stored = async (entry: Id<'entries'>) => {
    const e = (await row(entry))!
    return { data: e.data, rev: e.rev, fieldRevs: e.fieldRevs, prints: e.prints }
  }
  /** The owner gives the saibling a price (cents) for a time. */
  const offer = (amount: number, from: string, until: string, extra: Record<string, unknown> = {}) =>
    s.as.owner.mutation(api.entries.save, { site: 'restaurant', opId: opId(), entry: saibling, baseRev: 1, fields: { price: { amount } }, from, until, ...extra })
  const advanceTo = async (time: number) => {
    vi.advanceTimersByTime(time - Date.now())
    await s.t.finishInProgressScheduledFunctions()
  }
  return { ...s, saibling, row, dated, history, contentRev, bundleText, item, shownPrice, stored, offer, advanceTo }
}

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
})

describe('a save with an end (state table: save, days valid)', () => {
  // Wrong behaviour caught: an offer for later goes online at once, is written into the entry, or the page cannot
  // announce it with its end.
  it('waits: a row with until, no field written, the page announces it with its end', async () => {
    const s = await untilSetup()
    const before = await s.stored(s.saibling)
    await s.offer(990, '2026-10-20', '2026-12-31')
    expect(await s.dated(s.saibling)).toMatchObject([{ from: '2026-10-20', until: '2026-12-31', fields: { price: { amount: 990 } }, by: people.owner }])
    expect((await s.dated(s.saibling))[0]!.holds).toBeUndefined()
    expect(await s.stored(s.saibling)).toEqual(before)
    expect(await s.item(s.saibling)).toMatchObject({ data: { price: { amount: 1350 } }, upcoming: [{ from: '2026-10-20', until: '2026-12-31', data: { price: { amount: 990, currency: 'EUR' } } }] })
    expect((await s.history(s.saibling)).at(-1)).toMatchObject({ kind: 'dated', msg: { key: 'history.datedSavedUntil' } })
  })

  // Wrong behaviour caught: an offer from today waits for a run at midnight (a day too late), or writes the field.
  it('holds at once when it starts today: the page shows it with the normal value it covers, the entry stays', async () => {
    const s = await untilSetup()
    const before = await s.stored(s.saibling)
    const rev = await s.contentRev()
    await s.offer(990, TODAY, '2026-10-31')
    const [held] = await s.dated(s.saibling)
    expect(held).toMatchObject({ from: TODAY, until: '2026-10-31', holds: expect.any(Number) })
    expect(await s.stored(s.saibling)).toEqual(before)
    expect(await s.contentRev()).toBe(rev + 1)
    expect(await s.item(s.saibling)).toMatchObject({
      data: { price: { amount: 990 } },
      holding: [{ from: TODAY, until: '2026-10-31', data: { price: { amount: 990, currency: 'EUR' } }, normal: { price: { amount: 1350, currency: 'EUR' } } }],
    })
  })

  // Limits of the paper. Wrong behaviour caught: an end before the start, a start in the past, or a day more than a
  // year ahead is stored; an exception counts apart from the 20 waiting changes.
  it.each([
    ['an end before its start', ['2026-10-20', '2026-10-19'], 'errors.untilBeforeFrom'],
    ['a start before today', ['2026-10-07', '2026-10-31'], 'errors.dayBeforeToday'],
    ['an end more than a year ahead', ['2026-10-20', '2027-10-09'], 'errors.dayTooFarAhead'],
    ['an end that is no day', ['2026-10-20', '31.12.2026'], 'errors.dayInvalid'],
  ])('refuses %s', async (_, [from, until], key) => {
    const s = await untilSetup()
    expect(await errorOf(s.offer(990, from!, until!))).toMatchObject({ key })
    expect(await s.dated(s.saibling)).toEqual([])
  })

  // Round N9d: yearly rows count like the others (every second offer is yearly), and a yearly 21st is refused too.
  it('refuses a 21st row, all kinds counted', async () => {
    const s = await untilSetup()
    for (let i = 0; i < 10; i++) await s.offer(900 + i, `2026-11-${String(i + 1).padStart(2, '0')}`, '2026-11-30', i % 2 ? {} : { yearly: true })
    for (let i = 0; i < 10; i++) await s.as.owner.mutation(api.entries.save, { site: 'restaurant', opId: opId(), entry: s.saibling, baseRev: 1, fields: { price: { amount: 1400 + i } }, from: `2026-12-${String(i + 1).padStart(2, '0')}` })
    expect(await errorOf(s.offer(990, '2026-10-20', '2026-10-31'))).toMatchObject({ key: 'errors.tooManyDated' })
    expect(await errorOf(s.offer(990, '2026-10-20', '2026-10-31', { yearly: true }))).toMatchObject({ key: 'errors.tooManyDated' })
  })
})

describe('the same days and overlaps (state table)', () => {
  // Row "same two days again". Wrong behaviour caught: a second save of the same offer makes a second row, or drops a
  // field of the row it joins.
  it('the same two days join the row; its other fields stay', async () => {
    const s = await untilSetup()
    await s.offer(990, '2026-10-20', '2026-12-31', { fields: { price: { amount: 990 }, veg: 'vegan' } })
    await s.offer(890, '2026-10-20', '2026-12-31')
    expect(await s.dated(s.saibling)).toMatchObject([{ from: '2026-10-20', until: '2026-12-31', fields: { price: { amount: 890 }, veg: 'vegan' } }])
  })

  // Row "same two days again", holds. Wrong behaviour caught: a value saved into a holding offer reaches the page
  // without the checks of its start.
  it('a holding row joined again is checked again for the new values', async () => {
    const s = await untilSetup()
    await s.offer(990, TODAY, '2026-10-31')
    expect(await errorOf(s.offer(-5, TODAY, '2026-10-31'))).toMatchObject({ key: 'errors.pleaseCheckMarkedFields' })
    expect(await s.shownPrice(s.saibling)).toBe(990)
  })

  // Row "same from, other until, same field". Wrong behaviour caught: two offers of one start for one price are both
  // stored (which one shows?), or the refusal does not say which other offer is in the way, or names the day before its
  // end (the first instant of a Vienna day is the day before in UTC, where an error's text is worded).
  it('refuses the same start with another end for the same field, naming the other change', async () => {
    const s = await untilSetup()
    await s.offer(990, '2026-10-20', '2026-12-31')
    expect(await errorOf(s.offer(890, '2026-10-20', '2026-11-30'))).toMatchObject({ key: 'errors.datedSameStart', message: expect.stringContaining('bis 31. Dezember') })
    expect(await s.dated(s.saibling)).toHaveLength(1)
  })

  // Rows "overlap with another exception" and "a change without an end inside". Wrong behaviour caught: an overlapping
  // offer or a new normal price inside an offer is refused, or one of them is not listed for the editor.
  it('an overlapping offer and a normal price inside an offer are saved and listed', async () => {
    const s = await untilSetup()
    await s.offer(990, '2026-10-20', '2026-12-31')
    await s.offer(790, '2026-12-24', '2027-01-02')
    await s.as.owner.mutation(api.entries.save, { site: 'restaurant', opId: opId(), entry: s.saibling, baseRev: 1, fields: { price: { amount: 1390 } }, from: '2026-11-01' })
    const listed = await s.as.owner.query(api.datedChanges.list, { site: 'restaurant', entry: s.saibling })
    expect(listed.map((c) => [c.from, c.until ?? null])).toEqual([['2026-10-20', '2026-12-31'], ['2026-11-01', null], ['2026-12-24', '2027-01-02']])
  })
})

describe('the runs (start and end)', () => {
  // Wrong behaviour caught: the offer never starts, starts without a check, writes the field, or the website keeps its
  // old copy (no new contentRev).
  it('the start run lets it hold at the first minute of from, writes no field, and tells the website', async () => {
    const s = await untilSetup()
    await s.offer(990, '2026-10-09', '2026-10-10')
    const before = await s.stored(s.saibling)
    await s.advanceTo(at('2026-10-09') - 60_000)
    expect(await s.shownPrice(s.saibling)).toBe(1350)
    const rev = await s.contentRev()
    await s.advanceTo(at('2026-10-09') + 1000)
    expect((await s.dated(s.saibling))[0]!.holds).toBeDefined()
    expect(await s.shownPrice(s.saibling)).toBe(990)
    expect(await s.stored(s.saibling)).toEqual(before)
    expect(await s.contentRev()).toBe(rev + 1)
    expect((await s.history(s.saibling)).at(-1)).toMatchObject({ kind: 'datedStarted', actor: 'system', plannedBy: people.owner, msg: { key: 'history.datedStarted' } })
  })

  // Wrong behaviour caught: the offer stays after its last day, ends a day early, or the end writes the field.
  it('the end run drops it at the first minute after until, writes no field, and tells the website', async () => {
    const s = await untilSetup()
    await s.offer(990, '2026-10-09', '2026-10-10')
    const before = await s.stored(s.saibling)
    await s.advanceTo(at('2026-10-11') - 60_000)
    expect(await s.shownPrice(s.saibling)).toBe(990)
    const rev = await s.contentRev()
    await s.advanceTo(at('2026-10-11') + 1000)
    expect(await s.dated(s.saibling)).toEqual([])
    expect(await s.shownPrice(s.saibling)).toBe(1350)
    expect(await s.stored(s.saibling)).toEqual(before)
    expect(await s.contentRev()).toBe(rev + 1)
    expect((await s.history(s.saibling)).at(-1)).toMatchObject({ kind: 'datedEnded', actor: 'system', msg: { key: 'history.datedEnded' } })
  })

  // Row "start run fails its checks" and number 4. Wrong behaviour caught: an offer that fails its checks shows anyway,
  // or fails silently.
  it('a start run that fails stops the row with its reason and a mail; the row shows on no day', async () => {
    const s = await untilSetup()
    await s.offer(990, '2026-10-09', '2026-10-12')
    const [row] = await s.dated(s.saibling)
    await s.t.run((ctx) => ctx.db.patch(row!._id, { fields: { price: { amount: -5 } } }))
    for (const day of ['2026-10-09', '2026-10-10', '2026-10-12', '2026-10-13']) {
      await s.advanceTo(at(day) + 1000)
      expect([day, await s.shownPrice(s.saibling)]).toEqual([day, 1350])
    }
    expect((await s.dated(s.saibling))[0]).toMatchObject({ stopped: { reason: { code: 'invalid' } } })
    expect((await s.t.run((ctx) => ctx.db.query('outbox').collect())).map((m) => m.to)).toEqual(['wirtin@example.com'])
  })

  // Round L5: the start run checks what its day newly breaks, as the paper says, not only its own fields. Wrong behaviour
  // caught: a release since the save added a required field that the offer's value shows (`showWhen`), and the offer
  // holds anyway, so the website shows an entry with a required field empty.
  it('a start run whose day newly breaks the entry stops the row', async () => {
    const s = await untilSetup()
    await s.as.owner.mutation(api.entries.save, { site: 'restaurant', opId: opId(), entry: s.saibling, baseRev: 1, fields: { onMenu: false }, from: '2026-10-09', until: '2026-10-10' })
    await s.t.run(async (ctx) => {
      const schema = (await ctx.db.get(s.site))!.schema as Schema
      ;(schema.bricks.menu!.fields as Record<string, unknown>).backOn = { type: 'text', label: 'Wieder da am', max: 40, translate: false, showWhen: { field: 'onMenu', is: false } }
      await ctx.db.patch(s.site, { schema })
    })
    await s.advanceTo(at('2026-10-09') + 1000)
    const [row] = await s.dated(s.saibling)
    expect([row!.holds, row!.stopped?.reason]).toEqual([undefined, { code: 'invalid', fields: ['backOn'] }])
    expect((await s.item(s.saibling))?.data.onMenu).not.toBe(false)
  })

  // Ruling (3) after step 1. Wrong behaviour caught: an offer whose start comes while the entry is offline holds anyway,
  // so it shows the moment someone puts the entry online again, without a check or a word.
  it('a start run on an entry that is not online stops the row with a reason and a mail', async () => {
    const s = await untilSetup()
    await s.offer(990, '2026-10-09', '2026-10-12')
    await s.as.owner.mutation(api.entries.unpublish, { site: 'restaurant', opId: opId(), entry: s.saibling, lifeRev: (await s.row(s.saibling))!.lifeRev })
    await s.advanceTo(at('2026-10-09') + 1000)
    const [row] = await s.dated(s.saibling)
    expect([row!.holds, row!.stopped?.reason]).toEqual([undefined, { code: 'invalid', fields: ['price'], cause: { key: 'errors.exceptionNotOnline' } }])
    expect((await s.t.run((ctx) => ctx.db.query('outbox').collect())).map((m) => m.to)).toEqual(['wirtin@example.com'])
    await s.as.owner.mutation(api.entries.publish, { site: 'restaurant', opId: opId(), entry: s.saibling, lifeRev: (await s.row(s.saibling))!.lifeRev })
    expect(await s.shownPrice(s.saibling)).toBe(1350)
  })

  // Number 4. Wrong behaviour caught: the read lays over a row whose day has come but whose start run has not passed
  // (between midnight and the run, or a run that is still to stop it).
  it('a row whose start run has not passed shows on no day', async () => {
    const s = await untilSetup()
    await s.t.run((ctx) => ctx.db.insert('datedChanges', { site: s.site, entry: s.saibling, brick: 'menu', from: TODAY, until: '2026-10-31', fields: { price: { amount: 990 } }, prints: {}, revs: { price: 1 }, at: NOW }))
    expect(await s.shownPrice(s.saibling)).toBe(1350)
    expect((await s.item(s.saibling))?.holding).toBeUndefined()
  })
})

describe('numbers 1 to 3', () => {
  // Number 1: the platform read against the table both homes share (the file read: ginko-content/test/changes.test.ts).
  it('the platform read gives the values of the table on every day', async () => {
    const s = await untilSetup()
    await s.t.run(async (ctx) => {
      const e = (await ctx.db.get(s.saibling))!
      await ctx.db.patch(s.saibling, { data: { ...(e.data as object), ...bothHomes.stored } })
    })
    for (const c of bothHomes.changes) {
      await s.as.owner.mutation(api.entries.save, { site: 'restaurant', opId: opId(), entry: s.saibling, baseRev: 1, fields: c.set, from: c.from, ...(c.until ? { until: c.until } : {}) })
    }
    const seen: [string, number, boolean][] = []
    for (const [day] of bothHomes.days) {
      await s.advanceTo(at(day) + 1000)
      const shown = await s.item(s.saibling)
      seen.push([day, shown!.data.price.amount, shown!.data.onMenu ?? true])
    }
    expect(seen).toEqual(bothHomes.days)
  })

  // Number 2. Wrong behaviour caught: a start, an end, a cancel or a move writes a field into the entry (its value would
  // stay after the end, or a later normal edit would conflict with it).
  it('fields written into the entry by an exception: 0 (start, end, cancel, move)', async () => {
    const s = await untilSetup()
    const before = await s.stored(s.saibling)
    await s.offer(990, TODAY, '2026-10-09')
    await s.offer(890, '2026-10-20', '2026-10-25')
    const [held, waiting] = await s.dated(s.saibling)
    await s.as.owner.mutation(api.datedChanges.setDay, { site: 'restaurant', opId: opId(), change: waiting!._id, from: '2026-10-21', until: '2026-10-26' })
    await s.as.owner.mutation(api.datedChanges.setDay, { site: 'restaurant', opId: opId(), change: held!._id, from: TODAY, until: '2026-10-10' })
    expect(await s.stored(s.saibling)).toEqual(before)
    await s.as.owner.mutation(api.datedChanges.cancel, { site: 'restaurant', opId: opId(), change: waiting!._id })
    expect(await s.stored(s.saibling)).toEqual(before)
    await s.advanceTo(at('2026-10-11') + 1000)
    expect(await s.dated(s.saibling)).toEqual([])
    expect(await s.stored(s.saibling)).toEqual(before)
  })

  // Number 3, the spec's case. Wrong behaviour caught: the offer is lost when the normal price changes inside it, or the
  // old normal price comes back after the offer instead of the new one.
  it('after until the page shows the normal value of that day, with a normal change that came in between', async () => {
    const s = await untilSetup()
    await s.offer(990, '2026-10-20', '2026-12-31')
    await s.as.owner.mutation(api.entries.save, { site: 'restaurant', opId: opId(), entry: s.saibling, baseRev: 1, fields: { price: { amount: 1390 } }, from: '2026-11-01' })
    await s.advanceTo(at('2026-11-01') + 1000)
    expect([await s.shownPrice(s.saibling), ((await s.row(s.saibling))!.data as { price: Money }).price.amount]).toEqual([990, 1390])
    await s.advanceTo(at('2027-01-01') + 1000)
    expect(await s.shownPrice(s.saibling)).toBe(1390)
  })
})

// Round M1 (break-it P1-1): staff cancel only a row their task could have made. Wrong behaviour caught: the cook ends the
// owner's running offer through "Preis ändern" (the website price jumps back), cancels a change for good through a task
// with an end, or a season through a task that cannot make one; or the list offers a cancel the server refuses.
describe('a task cancels only a row it could have made (round M1)', () => {
  it.each<[string, string, (s: Awaited<ReturnType<typeof untilSetup>>) => Promise<unknown>, string | undefined]>([
    ['a task without an end, a row with one', 'menu.price', (s) => s.offer(990, TODAY, '2026-10-20'), 'errors.taskCannotEnd'],
    ['a task with an end, a row without one', 'menu.offer', (s) => s.as.owner.mutation(api.entries.save, { site: 'restaurant', opId: opId(), entry: s.saibling, baseRev: 1, fields: { price: { amount: 1500 } }, from: '2026-10-20' }), 'errors.taskNeedsDays'],
    ['a task without yearly, a yearly row', 'menu.offer', (s) => s.offer(990, '2026-12-01', '2027-01-31', { yearly: true }), 'errors.taskCannotYearly'],
    ['the today-only task, its own row', 'menu.offToday', (s) => s.as.cook.mutation(api.entries.save, { site: 'restaurant', opId: opId(), task: 'menu.offToday', entry: s.saibling, baseRev: 1, fields: {}, from: TODAY, until: TODAY }), undefined],
    ['a task without an end, a row without one', 'menu.price', (s) => s.as.owner.mutation(api.entries.save, { site: 'restaurant', opId: opId(), entry: s.saibling, baseRev: 1, fields: { price: { amount: 1500 } }, from: '2026-10-20' }), undefined],
  ])('%s: %s', async (_case, task, make, key) => {
    const s = await untilSetup()
    await make(s)
    const [made] = await s.dated(s.saibling)
    const [rev, price] = [await s.contentRev(), await s.shownPrice(s.saibling)]
    const listed = await s.as.cook.query(api.datedChanges.list, { site: 'restaurant', entry: s.saibling, task })
    expect(listed.find((r) => r.id === made!._id)?.mayCancel).toBe(key === undefined)
    const cancel = s.as.cook.mutation(api.datedChanges.cancel, { site: 'restaurant', opId: opId(), task, change: made!._id })
    if (key === undefined) {
      await cancel
      expect(await s.dated(s.saibling)).toEqual([])
      return
    }
    expect(await errorOf(cancel)).toMatchObject({ key })
    expect([(await s.dated(s.saibling)).map((r) => [r._id, r.holds]), await s.contentRev(), await s.shownPrice(s.saibling)]).toEqual([[[made!._id, made!.holds]], rev, price])
  })
})

describe('moving and ending (state table: Tage ändern, Änderung aufheben, Jetzt beenden)', () => {
  // Row "Tage ändern", waits. Wrong behaviour caught: a move keeps the old end, or skips the limits.
  it('a waiting row moves both days, within the limits', async () => {
    const s = await untilSetup()
    await s.offer(990, '2026-10-20', '2026-12-31')
    const [row] = await s.dated(s.saibling)
    await s.as.owner.mutation(api.datedChanges.setDay, { site: 'restaurant', opId: opId(), change: row!._id, from: '2026-10-25', until: '2027-01-06' })
    expect(await s.dated(s.saibling)).toMatchObject([{ from: '2026-10-25', until: '2027-01-06' }])
    expect(await errorOf(s.as.owner.mutation(api.datedChanges.setDay, { site: 'restaurant', opId: opId(), change: row!._id, from: '2026-10-25', until: '2026-10-24' }))).toMatchObject({ key: 'errors.untilBeforeFrom' })
  })

  // Row "Tage ändern", holds, and decision 4. Wrong behaviour caught: the start of a holding offer moves (a start in
  // the past has no meaning), or its end moves before today.
  it('a holding row moves only its end, not before today', async () => {
    const s = await untilSetup()
    await s.offer(990, TODAY, '2026-10-31')
    const [row] = await s.dated(s.saibling)
    const move = (from: string, until: string) => s.as.owner.mutation(api.datedChanges.setDay, { site: 'restaurant', opId: opId(), change: row!._id, from, until })
    expect(await errorOf(move('2026-10-09', '2026-10-31'))).toMatchObject({ key: 'errors.holdingFromFixed' })
    expect(await errorOf(move(TODAY, '2026-10-07'))).toMatchObject({ key: 'errors.untilBeforeFrom' })
    await move(TODAY, '2026-11-15')
    expect(await s.dated(s.saibling)).toMatchObject([{ from: TODAY, until: '2026-11-15' }])
    await s.advanceTo(at('2026-11-01') + 1000)
    expect(await s.shownPrice(s.saibling)).toBe(990)
  })

  // Round L2. Wrong behaviour caught: staff move a today-only row's end to next week through the today-only task, or an
  // exception's end through a task that asks one day; owners lose the move, or staff lose the cancel through the task.
  it('staff move a row only to days their task allows; owners move as before; the cancel through the task stays', async () => {
    const s = await untilSetup()
    await s.as.cook.mutation(api.entries.save, { site: 'restaurant', opId: opId(), task: 'menu.offToday', entry: s.saibling, baseRev: 1, fields: {}, from: TODAY, until: TODAY })
    await s.offer(990, '2026-10-20', '2026-10-25')
    const [today, offer] = (await s.dated(s.saibling)).sort((a, b) => a.from.localeCompare(b.from))
    const move = (who: 'cook' | 'owner', task: string | undefined, change: Id<'datedChanges'>, from: string, until: string) =>
      s.as[who].mutation(api.datedChanges.setDay, { site: 'restaurant', opId: opId(), ...(task ? { task } : {}), change, from, until })
    expect(await errorOf(move('cook', 'menu.offToday', today!._id, TODAY, '2026-10-15'))).toMatchObject({ key: 'errors.todayOnly' })
    expect(await errorOf(move('cook', 'menu.price', offer!._id, '2026-10-20', '2026-10-28'))).toMatchObject({ key: 'errors.taskCannotEnd' })
    const listed = await s.as.cook.query(api.datedChanges.list, { site: 'restaurant', entry: s.saibling, task: 'menu.offToday' })
    expect(listed.find((r) => r.id === today!._id)).toMatchObject({ mayMove: false, mayCancel: true })
    await move('owner', undefined, today!._id, TODAY, '2026-10-15')
    expect((await s.dated(s.saibling)).find((r) => r._id === today!._id)).toMatchObject({ until: '2026-10-15' })
    await s.as.cook.mutation(api.datedChanges.cancel, { site: 'restaurant', opId: opId(), task: 'menu.offer', change: offer!._id })
    expect((await s.dated(s.saibling)).map((r) => r._id)).toEqual([today!._id])
  })

  // Row "Bearbeiten then other days", holds. Wrong behaviour caught: editing a holding offer with a longer end makes a
  // second offer of the same start (refused as a clash), or lets the start move.
  it('a save that edits a holding row changes its end and values in the same row; its start stays', async () => {
    const s = await untilSetup()
    await s.offer(990, TODAY, '2026-10-31')
    const [row] = await s.dated(s.saibling)
    await s.offer(950, TODAY, '2026-11-15', { change: row!._id })
    expect(await s.dated(s.saibling)).toMatchObject([{ _id: row!._id, from: TODAY, until: '2026-11-15', fields: { price: { amount: 950 } } }])
    expect(await s.shownPrice(s.saibling)).toBe(950)
    expect(await errorOf(s.offer(950, '2026-10-09', '2026-11-15', { change: row!._id }))).toMatchObject({ key: 'errors.holdingFromFixed' })
  })

  // Round L7, "Bearbeiten" on a waiting offer. Wrong behaviour caught: a new end for a waiting offer was refused as a
  // second offer of the same start (errors.datedSameStart). Keep: another start is a second offer (H1.4).
  it('a save that edits a waiting row with its own start changes that row; another start is a second offer', async () => {
    const s = await untilSetup()
    await s.offer(990, '2026-10-20', '2026-10-31')
    const [row] = await s.dated(s.saibling)
    await s.offer(950, '2026-10-20', '2026-11-15', { change: row!._id })
    expect(await s.dated(s.saibling)).toMatchObject([{ _id: row!._id, from: '2026-10-20', until: '2026-11-15', fields: { price: { amount: 950 } } }])
    await s.offer(900, '2026-10-22', '2026-11-15', { change: row!._id })
    expect((await s.dated(s.saibling)).map((r) => [r._id === row!._id, r.from, r.until])).toEqual([[true, '2026-10-20', '2026-11-15'], [false, '2026-10-22', '2026-11-15']])
  })

  // Row "Änderung aufheben / Jetzt beenden". Wrong behaviour caught: ending a holding offer leaves the offer on the
  // website until a later refresh, or leaves no trace in the history.
  it('"Jetzt beenden" drops a holding row: the page shows the normal value at once, with a history line', async () => {
    const s = await untilSetup()
    await s.offer(990, TODAY, '2026-10-31')
    const [row] = await s.dated(s.saibling)
    const rev = await s.contentRev()
    await s.as.owner.mutation(api.datedChanges.cancel, { site: 'restaurant', opId: opId(), change: row!._id })
    expect(await s.dated(s.saibling)).toEqual([])
    expect(await s.shownPrice(s.saibling)).toBe(1350)
    expect(await s.contentRev()).toBe(rev + 1)
    expect((await s.history(s.saibling)).at(-1)).toMatchObject({ kind: 'datedCancelled', msg: { key: 'history.datedEndedNow' } })
  })

  it('"Änderung aufheben" drops a waiting row with a history line', async () => {
    const s = await untilSetup()
    await s.offer(990, '2026-10-20', '2026-12-31')
    const [row] = await s.dated(s.saibling)
    await s.as.owner.mutation(api.datedChanges.cancel, { site: 'restaurant', opId: opId(), change: row!._id })
    expect(await s.dated(s.saibling)).toEqual([])
    expect((await s.history(s.saibling)).at(-1)).toMatchObject({ kind: 'datedCancelled', msg: { key: 'history.datedCancelled' } })
  })

  // Row "shared row". Wrong behaviour caught: staff whose change needs a yes end someone else's holding offer without one.
  it('staff who need a yes cannot end someone else\'s holding offer', async () => {
    const s = await untilSetup({ needsApproval: true })
    await s.offer(990, TODAY, '2026-10-31')
    const [row] = await s.dated(s.saibling)
    expect(await errorOf(s.as.cook.mutation(api.datedChanges.cancel, { site: 'restaurant', opId: opId(), task: 'menu.offer', change: row!._id }))).toMatchObject({ code: 'FORBIDDEN', key: 'errors.needsApprovalProposeAgain' })
    expect(await s.shownPrice(s.saibling)).toBe(990)
  })
})

describe('the entry around a holding offer (state table)', () => {
  // Row "the entry went offline meanwhile". Wrong behaviour caught: an offer for a draft is stored; a holding offer is
  // lost when the entry goes offline, or shows again after its end. Round L10: the refusal of an offer told the person
  // to save without a day, which a task with an end cannot do; it has its own sentence.
  it('waits: a draft refuses an offer with its own sentence', async () => {
    const s = await untilSetup()
    await s.as.owner.mutation(api.entries.unpublish, { site: 'restaurant', opId: opId(), entry: s.saibling, lifeRev: (await s.row(s.saibling))!.lifeRev })
    expect(await errorOf(s.offer(990, '2026-10-20', '2026-12-31'))).toMatchObject({ key: 'errors.exceptionOnlyOnline', message: 'Nur ein Eintrag, der online ist, bekommt Werte für bestimmte Tage. Stelle ihn zuerst online.' })
  })

  // Round N9b: the same for a yearly row, which after its end stays (waiting for next year) instead of going.
  it.each<[string, Record<string, unknown>, number]>([
    ['an offer', {}, 0],
    ['a yearly row', { yearly: true }, 1],
  ])('holds: offline the row stays and shows nothing; online again inside its days it shows again (%s)', async (_, extra, rowsAfterEnd) => {
    const s = await untilSetup()
    await s.offer(990, TODAY, '2026-10-31', extra)
    await s.as.owner.mutation(api.entries.unpublish, { site: 'restaurant', opId: opId(), entry: s.saibling, lifeRev: (await s.row(s.saibling))!.lifeRev })
    expect(await s.item(s.saibling)).toBeUndefined()
    expect(await s.dated(s.saibling)).toHaveLength(1)
    await s.as.owner.mutation(api.entries.publish, { site: 'restaurant', opId: opId(), entry: s.saibling, lifeRev: (await s.row(s.saibling))!.lifeRev })
    expect(await s.shownPrice(s.saibling)).toBe(990)
    await s.advanceTo(at('2026-11-01') + 1000)
    expect([await s.shownPrice(s.saibling), (await s.dated(s.saibling)).length]).toEqual([1350, rowsAfterEnd])
  })

  // Row "normal value edited (now)". Wrong behaviour caught: a normal edit while an offer holds is refused, changes what
  // the page shows today, or passes although what the page shows today breaks (checked against the stored values only).
  it('a normal save while an offer holds writes the normal value; the page keeps the offer', async () => {
    const s = await untilSetup()
    await s.offer(990, TODAY, '2026-10-31')
    await s.as.owner.mutation(api.entries.save, { site: 'restaurant', opId: opId(), entry: s.saibling, baseRev: 1, fields: { price: { amount: 1450 } }, publish: true })
    expect(((await s.row(s.saibling))!.data as { price: Money }).price.amount).toBe(1450)
    expect(await s.item(s.saibling)).toMatchObject({ data: { price: { amount: 990 } }, holding: [{ normal: { price: { amount: 1450, currency: 'EUR' } } }] })
  })

  it('a normal save is checked for what the page shows today too', async () => {
    const s = await untilSetup()
    await s.t.run(async (ctx) => {
      const schema = (await ctx.db.get(s.site))!.schema as Schema
      const description = schema.bricks.menu!.fields.description as { optional?: boolean; showWhen?: unknown }
      delete description.optional
      description.showWhen = { field: 'veg', is: 'vegan' }
      await ctx.db.patch(s.site, { schema })
      const e = (await ctx.db.get(s.saibling))!
      await ctx.db.patch(s.saibling, { data: { ...(e.data as object), veg: 'none', description: { de: 'Mit Kren' } } })
    })
    await s.as.owner.mutation(api.entries.save, { site: 'restaurant', opId: opId(), entry: s.saibling, baseRev: 1, fields: { veg: 'vegan' }, from: TODAY, until: '2026-10-31' })
    // Stored: not vegan, so the description may go; today the page shows the dish as vegan, which needs one.
    expect(await errorOf(s.as.owner.mutation(api.entries.save, { site: 'restaurant', opId: opId(), entry: s.saibling, baseRev: 1, fields: { description: null }, publish: true }))).toMatchObject({ key: 'errors.pleaseCheckMarkedFields' })
  })

  // Row "entry to the trash / restored". Wrong behaviour caught: a holding offer comes back with a restored entry
  // (D109: its dated changes go with it); round M3: the history calls the holding offer "geplant" (it was running).
  // Round N9c: a waiting yearly row goes too and counts as planned; it does not come back next year after a restore.
  it('the trash takes a holding offer with the entry; a restore does not bring it back', async () => {
    const s = await untilSetup()
    await s.offer(990, TODAY, '2026-10-31')
    await s.offer(800, '2026-11-15', '2026-11-30')
    await s.offer(700, '2026-12-01', '2026-12-31', { yearly: true })
    const lifeRev = (await s.row(s.saibling))!.lifeRev
    await s.as.owner.mutation(api.entries.remove, { site: 'restaurant', opId: opId(), entry: s.saibling, lifeRev })
    expect(await s.dated(s.saibling)).toEqual([])
    expect((await s.history(s.saibling)).filter((c) => c.kind === 'datedCancelled').map((c) => [c.msg!.key, c.msg!.params!.count]))
      .toEqual([['history.datedCancelledWithEntry', 2], ['history.datedEndedWithEntry', 1]])
    await s.as.owner.mutation(api.entries.restore, { site: 'restaurant', opId: opId(), entry: s.saibling, lifeRev: lifeRev + 1 })
    expect(await s.shownPrice(s.saibling)).toBe(1350)
    await s.advanceTo(at('2026-12-01') + 1000)
    expect(await s.shownPrice(s.saibling)).toBe(1350)
  })
})

describe('task keys on the server', () => {
  // Wrong behaviour caught: a task that asks one day lets staff save an end; a today-only task saves another day; a task
  // with an end called without its days (round L1) saves its values into the entry for good (number 2).
  it.each([
    // Round M4: the sentence says the task changes values from a day, not "from now on" (taskCannotDate).
    ['an end through a task that asks one day', 'menu.price', { fields: { price: { amount: 990 } }, from: '2026-10-20', until: '2026-12-31' }, 'errors.taskCannotEnd'],
    ['another day through a today-only task', 'menu.offToday', { fields: {}, from: '2026-10-09', until: '2026-10-09' }, 'errors.todayOnly'],
    ['a today-only task without its days', 'menu.offToday', { fields: {} }, 'errors.taskNeedsDays'],
    ['an offer without its days', 'menu.offer', { fields: { price: { amount: 990 } } }, 'errors.taskNeedsDays'],
    ['an offer with its first day only', 'menu.offer', { fields: { price: { amount: 990 } }, from: '2026-10-20' }, 'errors.taskNeedsDays'],
  ])('refuses %s', async (_, task, args, key) => {
    const s = await untilSetup()
    const before = await s.stored(s.saibling)
    expect(await errorOf(s.as.cook.mutation(api.entries.save, { site: 'restaurant', opId: opId(), task, entry: s.saibling, baseRev: 1, ...args }))).toMatchObject({ key })
    expect(await s.dated(s.saibling)).toEqual([])
    expect(await s.stored(s.saibling)).toEqual(before)
  })

  // Round L1, the same hole through publish. Wrong behaviour caught: staff with only the offer task publish someone's
  // unpublished price through it, for good (a publish has no end), now or as a change without an end.
  it.each([['now', {}], ['from a day', { from: '2026-10-20' }]])('refuses a publish through a task with an end (%s)', async (_, extra) => {
    const s = await untilSetup()
    await s.as.owner.mutation(api.entries.save, { site: 'restaurant', opId: opId(), entry: s.saibling, baseRev: 1, fields: { price: { amount: 1990 } } })
    const before = await s.stored(s.saibling)
    const lifeRev = (await s.row(s.saibling))!.lifeRev
    expect(await errorOf(s.as.cook.mutation(api.entries.publish, { site: 'restaurant', opId: opId(), task: 'menu.offer', entry: s.saibling, lifeRev, ...extra }))).toMatchObject({ key: 'errors.taskNeedsDays' })
    expect(await s.stored(s.saibling)).toEqual(before)
    expect(await s.dated(s.saibling)).toEqual([])
  })

  // Keep of round L1. Wrong behaviour caught: the both-days rule also catches a task without an end, so a price task that
  // asks a day can no longer save now, or a task with fixed values and no day stops saving them.
  it('a task that asks one day still saves now without a day; a task with fixed values and no day is a normal save', async () => {
    const s = await untilSetup()
    await s.t.run(async (ctx) => {
      const schema = (await ctx.db.get(s.site))!.schema as Schema
      ;(schema.bricks.menu!.tasks as unknown[]).push({ id: 'offNow', label: 'Von der Karte', kind: 'edit', pick: true, fields: [], set: { onMenu: false } })
      await ctx.db.patch(s.site, { schema })
      const cook = (await ctx.db.query('memberships').collect()).find((m) => m.user === people.cook)!
      await ctx.db.patch(cook._id, { grants: [...cook.grants, 'menu.offNow'] })
    })
    await s.as.cook.mutation(api.entries.save, { site: 'restaurant', opId: opId(), task: 'menu.price', entry: s.saibling, baseRev: 1, fields: { price: { amount: 1490 } }, publish: true })
    await s.as.cook.mutation(api.entries.save, { site: 'restaurant', opId: opId(), task: 'menu.offNow', entry: s.saibling, baseRev: 2, fields: {}, publish: true })
    expect((await s.stored(s.saibling)).data).toMatchObject({ price: { amount: 1490 }, onMenu: false })
    expect(await s.dated(s.saibling)).toEqual([])
  })

  // Wrong behaviour caught: the task's fixed value is not sent (nothing happens), or staff send another value for it.
  it('a today-only task saves its fixed values as an exception for today', async () => {
    const s = await untilSetup()
    await s.as.cook.mutation(api.entries.save, { site: 'restaurant', opId: opId(), task: 'menu.offToday', entry: s.saibling, baseRev: 1, fields: {}, from: TODAY, until: TODAY })
    expect(await s.dated(s.saibling)).toMatchObject([{ from: TODAY, until: TODAY, fields: { onMenu: false }, holds: expect.any(Number) }])
    expect((await s.item(s.saibling))?.data.onMenu).toBe(false)
    expect(await errorOf(s.as.cook.mutation(api.entries.save, { site: 'restaurant', opId: opId(), task: 'menu.offToday', entry: s.saibling, baseRev: 1, fields: { onMenu: true }, from: TODAY, until: TODAY }))).toMatchObject({ code: 'FORBIDDEN' })
  })
})

describe('a request that holds both days (state table: the person needs a yes)', () => {
  async function asked(from = '2026-10-09', until = '2026-10-10') {
    const s = await untilSetup({ needsApproval: true })
    const sent = await s.as.cook.mutation(api.entries.save, { site: 'restaurant', opId: opId(), task: 'menu.offer', entry: s.saibling, baseRev: 1, fields: { price: { amount: 990 } }, from, until }) as unknown as Proposed
    expect(sent.proposal).toBeDefined()
    expect(await s.dated(s.saibling)).toEqual([])
    return { ...s, sent }
  }

  // Wrong behaviour caught: the request loses its end, so the yes makes a new normal price for good.
  it('the request holds both days; a yes before the start makes the waiting row', async () => {
    const s = await asked()
    expect(await s.as.cook.query(api.proposals.ownFor, { site: 'restaurant', entry: s.saibling })).toMatchObject({ from: '2026-10-09', until: '2026-10-10' })
    await s.as.owner.mutation(api.proposals.approve, { proposal: s.sent.proposal })
    expect(await s.dated(s.saibling)).toMatchObject([{ from: '2026-10-09', until: '2026-10-10', by: people.cook }])
  })

  it('a yes inside the days holds at once', async () => {
    const s = await asked()
    await s.advanceTo(at('2026-10-09') + 3600_000)
    await s.as.owner.mutation(api.proposals.approve, { proposal: s.sent.proposal })
    expect((await s.dated(s.saibling))[0]!.holds).toBeDefined()
    expect(await s.shownPrice(s.saibling)).toBe(990)
  })

  // Round L5. Wrong behaviour caught: a change without an end on a day an offer holds starts from the offer's values
  // (its `before`), so the request names the offer as the value it replaces, and merged parts of it reach the entry.
  it('a request for a new normal value on a day an offer holds names the normal value as the one it replaces', async () => {
    const s = await untilSetup()
    await s.t.run(async (ctx) => {
      const schema = (await ctx.db.get(s.site))!.schema as Schema
      for (const task of schema.bricks.menu!.tasks ?? []) if (task.id === 'price') (task as { needsApproval?: boolean }).needsApproval = true
      await ctx.db.patch(s.site, { schema })
    })
    await s.offer(990, TODAY, '2026-10-31')
    const sent = await s.as.cook.mutation(api.entries.save, { site: 'restaurant', opId: opId(), task: 'menu.price', entry: s.saibling, baseRev: 1, fields: { price: { amount: 1490 } }, from: '2026-10-20' }) as unknown as Proposed
    const proposal = await s.t.run((ctx) => ctx.db.get(sent.proposal))
    expect([proposal?.before, proposal?.after]).toEqual([{ price: { amount: 1350 } }, { price: { amount: 1490 } }])
  })

  // Round L3, the untested path. Wrong behaviour caught: a yes for a new offer after its first day is refused as a day
  // before today, or holds from the asked day instead of from today.
  it('a yes for a new offer after its first day, before its end, holds from today', async () => {
    const s = await asked(TODAY, '2026-10-12')
    await s.advanceTo(at('2026-10-09') + 3600_000)
    await s.as.owner.mutation(api.proposals.approve, { proposal: s.sent.proposal })
    expect(await s.dated(s.saibling)).toMatchObject([{ from: '2026-10-09', until: '2026-10-12', holds: expect.any(Number) }])
    expect(await s.shownPrice(s.saibling)).toBe(990)
  })

  // Round L3. Wrong behaviour caught: a yes on day 2 or later for a request that edits a holding offer moves its start to
  // today and is refused (its start is fixed), so the longer end never comes.
  it('a yes on day 2 for a request that extends a holding offer gives the same row the new end', async () => {
    const s = await untilSetup({ needsApproval: true })
    await s.offer(990, TODAY, '2026-10-12')
    const [row] = await s.dated(s.saibling)
    const sent = await s.as.cook.mutation(api.entries.save, { site: 'restaurant', opId: opId(), task: 'menu.offer', entry: s.saibling, baseRev: 1, fields: { price: { amount: 990 } }, from: TODAY, until: '2026-10-20', change: row!._id }) as unknown as Proposed
    await s.advanceTo(at('2026-10-09') + 3600_000)
    expect(await s.as.owner.mutation(api.proposals.approve, { proposal: sent.proposal })).not.toMatchObject({ status: 'stale' })
    expect(await s.dated(s.saibling)).toMatchObject([{ _id: row!._id, from: TODAY, until: '2026-10-20' }])
    await s.advanceTo(at('2026-10-15') + 1000)
    expect(await s.shownPrice(s.saibling)).toBe(990)
  })

  // Round L5. Wrong behaviour caught: the Studio offers a yes on a request whose last day has passed (the yes then fails
  // as stale), instead of showing it as stale before.
  it('a request whose last day has passed shows as stale before the yes', async () => {
    const s = await asked(TODAY, TODAY)
    const conflictMsg = async () => (await s.as.owner.query(api.proposals.get, { site: 'restaurant', proposal: s.sent.proposal }))?.conflictMsg
    expect(await conflictMsg()).toBeNull()
    await s.advanceTo(at('2026-10-09') + 3600_000)
    expect(await conflictMsg()).toMatchObject({ key: 'history.staleTimeGone' })
  })

  // Wrong behaviour caught: a yes after the offer ended puts the offer online (or writes it into the entry for good).
  it('a yes after the end is stale (timeGone) and writes nothing', async () => {
    const s = await asked(TODAY, TODAY)
    await s.advanceTo(at('2026-10-09') + 3600_000)
    expect(await s.as.owner.mutation(api.proposals.approve, { proposal: s.sent.proposal })).toMatchObject({ status: 'stale' })
    expect(await s.dated(s.saibling)).toEqual([])
    expect(await s.shownPrice(s.saibling)).toBe(1350)
  })
})

describe('the bundle around exceptions', () => {
  // Keep: the platform read without holding rows gives byte for byte what it gave before. Wrong behaviour caught: a
  // waiting exception of a field outside timeline.public changes what a page gets.
  it('a waiting exception of a private field leaves the bundle as it was, byte for byte', async () => {
    const s = await untilSetup()
    const before = await s.bundleText()
    await s.as.owner.mutation(api.entries.save, { site: 'restaurant', opId: opId(), entry: s.saibling, baseRev: 1, fields: { veg: 'vegan' }, from: '2026-10-20', until: '2026-10-31' })
    expect(await s.bundleText()).toBe(before)
  })

  // Wrong behaviour caught: the covered normal value of a field outside timeline.public leaves the server.
  it('a holding exception of a private field shows today, without holding', async () => {
    const s = await untilSetup()
    await s.as.owner.mutation(api.entries.save, { site: 'restaurant', opId: opId(), entry: s.saibling, baseRev: 1, fields: { veg: 'vegan' }, from: TODAY, until: '2026-10-31' })
    const shown = await s.item(s.saibling)
    expect([shown?.data.veg, shown?.holding]).toEqual(['vegan', undefined])
  })
})

describe('export and import (state table: export, import, file form)', () => {
  // Wrong behaviour caught: a backup loses the end (the offer would come back as a price for good), or an import keeps
  // an offer that has ended.
  it('a backup carries the end; an import plans a waiting offer, holds a current one and leaves out an ended one', async () => {
    const s = await untilSetup()
    await s.offer(990, '2026-10-20', '2026-12-31')
    const snapshot = await s.t.query(internal.backup.snapshot, { site: s.site })
    expect(snapshot.entries.find((e) => e.id === s.saibling)).toMatchObject({ changes: [{ from: '2026-10-20', until: '2026-12-31', set: { price: { amount: 990 } } }] })

    vi.stubEnv('GINKO_LOCAL', '1')
    const dish = { category: 'starters', name: { de: 'Forelle' }, price: { amount: 1200 }, allergens: ['D'], veg: 'none' }
    await s.t.mutation(internal.seed.importExport, {
      site: 'restaurant', files: [],
      entries: [{ id: 'm1', brick: 'menu', kind: 'item', order: 99, prints: {}, rev: 1, data: dish, changes: [
        { from: '2026-09-01', until: '2026-09-30', set: { price: { amount: 900 } } },
        { from: '2026-10-01', until: '2026-10-31', set: { price: { amount: 1000 } } },
        { from: '2026-11-01', until: '2026-11-30', set: { price: { amount: 1100 } } },
      ] }],
    })
    const menu = await s.t.run((ctx) => ctx.db.query('entries').withIndex('by_site_brick_order', (q) => q.eq('site', s.site).eq('brick', 'menu')).collect())
    const trout = menu.find((e) => (e.data as { name: { de: string } }).name.de === 'Forelle')!
    expect(trout.data).toMatchObject({ price: { amount: 1200 } })
    const rows = await s.dated(trout._id)
    expect(rows.map((r) => [r.from, r.until, r.holds !== undefined])).toEqual([['2026-10-01', '2026-10-31', true], ['2026-11-01', '2026-11-30', false]])
    expect(await s.shownPrice(trout._id)).toBe(1000)
  })

  // Round L5. Wrong behaviour caught: an import lets a draft's current offer hold, so it shows unchecked the moment the
  // entry goes online. It comes back stopped, as its start run stops it (ruling 3); a later one waits.
  it('an import stops a draft\'s current offer with its reason; a later one waits', async () => {
    const s = await untilSetup()
    vi.stubEnv('GINKO_LOCAL', '1')
    const dish = { category: 'starters', name: { de: 'Forelle' }, price: { amount: 1200 }, allergens: ['D'], veg: 'none' }
    await s.t.mutation(internal.seed.importExport, {
      site: 'restaurant', files: [],
      entries: [{ id: 'm1', brick: 'menu', kind: 'item', order: 99, prints: {}, rev: 1, state: 'draft', data: dish, changes: [
        { from: '2026-10-01', until: '2026-10-31', set: { price: { amount: 1000 } } },
        { from: '2026-11-01', until: '2026-11-30', set: { price: { amount: 1100 } } },
      ] }],
    })
    const menu = await s.t.run((ctx) => ctx.db.query('entries').withIndex('by_site_brick_order', (q) => q.eq('site', s.site).eq('brick', 'menu')).collect())
    const trout = menu.find((e) => (e.data as { name: { de: string } }).name.de === 'Forelle')!
    const rows = await s.dated(trout._id)
    expect(rows.map((r) => [r.from, r.holds !== undefined, r.stopped?.reason ?? null])).toEqual([
      ['2026-10-01', false, { code: 'invalid', fields: ['price'], cause: { key: 'errors.exceptionNotOnline' } }],
      ['2026-11-01', false, null],
    ])
  })
})
