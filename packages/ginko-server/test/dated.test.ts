// Dated changes on the platform (D125–D128): `entries.save` and `entries.publish` with `from`, the run on the day
// (`datedChanges.applyDue`), a change that stops, moving and cancelling, removal, the bundle's `upcoming` and the export.
import { factComponent, SITE_BUDGET as BUDGET, type Schema } from '@lupinum/ginko/internal'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { api, internal } from '../convex/_generated/api'
import type { Id } from '../convex/_generated/dataModel'
import { ConvexError } from 'convex/values'
import { writeStop } from '../convex/lib/stopped'
import { errorOf, opId, people, setup, upload } from './setup'

// Mail is the one thing mocked besides the clock: the outbox records it.
const NOW = Date.parse('2026-10-08T10:00:00Z')
/** 9 October 2026, 00:00 in Vienna (CEST): the first minute of the day planned below. A session lasts 24 hours. */
const DAY1 = Date.parse('2026-10-08T22:00:00Z')

type Item = { id: string; data: Record<string, unknown>; upcoming?: { from: string; data: Record<string, unknown> }[] }
type Proposed = { proposal: Id<'proposals'> }

/** The restaurant on a fake clock, its menu with `timeline: { public: ['price'] }` and a price task that asks a day. */
async function datedSetup(opts: { needsApproval?: boolean } = {}) {
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
  vi.stubEnv('GINKO_MAIL', 'outbox')
  vi.stubEnv('SITE_URL', 'https://ginko.test')
  const s = await setup()
  await s.t.run(async (ctx) => {
    const schema = (await ctx.db.get(s.site))!.schema as Schema
    const menu = schema.bricks.menu! as { timeline?: { public: string[] } }
    menu.timeline = { public: ['price'] }
    for (const task of schema.bricks.menu!.tasks ?? []) {
      if (task.id === 'price') (task as { when?: { from: 'ask' } }).when = { from: 'ask' }
      if (opts.needsApproval) (task as { needsApproval?: boolean }).needsApproval = true
    }
    await ctx.db.patch(s.site, { schema })
  })
  const saibling = s.entries['menu-saibling']!
  const row = (id: Id<'entries'>) => s.t.run((ctx) => ctx.db.get(id))
  const dated = (entry: Id<'entries'>) => s.t.run((ctx) => ctx.db.query('datedChanges').withIndex('by_entry', (q) => q.eq('entry', entry)).collect())
  const history = (entry: Id<'entries'>) => s.t.run((ctx) => ctx.db.query('changes').withIndex('by_entry', (q) => q.eq('entry', entry)).collect())
  const contentRev = async () => (await s.t.run((ctx) => ctx.db.get(s.site)))!.contentRev
  const item = async (entry: Id<'entries'>): Promise<Item> => {
    const bundle = await (await s.t.fetch('/bundle/restaurant?format=3&locale=de')).json() as { bricks: { menu: { items: Item[] } } }
    return bundle.bricks.menu.items.find((i) => i.id === entry)!
  }
  const bundleText = async () => (await s.t.fetch('/bundle/restaurant?format=3&locale=de')).text()
  /** The owner plans a price (cents) of the saibling from a day. */
  const plan = (amount: number, from = '2026-10-09', extra: Record<string, unknown> = {}) =>
    s.as.owner.mutation(api.entries.save, { site: 'restaurant', opId: opId(), entry: saibling, baseRev: 1, fields: { price: { amount } }, from, ...extra })
  const advanceTo = async (time: number) => {
    vi.advanceTimersByTime(time - Date.now())
    await s.t.finishInProgressScheduledFunctions()
  }
  return { ...s, saibling, row, dated, history, contentRev, item, bundleText, plan, advanceTo }
}

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
})

describe('a save with a day', () => {
  // Wrong behaviour caught: a planned price goes online at once, or waits without the page being able to announce it.
  it('keeps the entry as it is, stores the change, raises contentRev and puts the price in upcoming', async () => {
    const s = await datedSetup()
    const rev = await s.contentRev()
    const saved = await s.plan(1450)
    expect(saved).toMatchObject({ from: '2026-10-09', contentRev: rev + 1 })
    expect((await s.row(s.saibling))!.data).toMatchObject({ price: { amount: 1350 } })
    expect(await s.dated(s.saibling)).toMatchObject([{ from: '2026-10-09', fields: { price: { amount: 1450 } }, by: people.owner }])
    expect(await s.item(s.saibling)).toMatchObject({ data: { price: { amount: 1350 } }, upcoming: [{ from: '2026-10-09', data: { price: { amount: 1450, currency: 'EUR' } } }] })
    const listed = await s.as.owner.query(api.datedChanges.list, { site: 'restaurant', entry: s.saibling })
    expect(listed).toMatchObject([{ from: '2026-10-09', values: { price: { amount: 1450 } }, changedSince: [] }])
    expect((await s.history(s.saibling)).at(-1)).toMatchObject({ kind: 'dated', msg: { key: 'history.datedSaved' } })
  })

  // Wrong behaviour caught: a later value of a field that no page may read ahead leaks into the bundle.
  it('a field outside timeline.public stays out of the bundle and leaves contentRev', async () => {
    const s = await datedSetup()
    const rev = await s.contentRev()
    await s.as.owner.mutation(api.entries.save, { site: 'restaurant', opId: opId(), entry: s.saibling, baseRev: 1, fields: { veg: 'vegan' }, from: '2026-10-09' })
    expect(await s.contentRev()).toBe(rev)
    expect((await s.item(s.saibling)).upcoming).toBeUndefined()
    expect((await s.item(s.saibling)).data).toMatchObject({ veg: 'none' })
  })

  it('the same day merges into one change, named after the last saver', async () => {
    const s = await datedSetup()
    await s.plan(1450)
    await s.as.cook.mutation(api.entries.save, { site: 'restaurant', opId: opId(), task: 'menu.price', entry: s.saibling, baseRev: 1, fields: { price: { amount: 1490 } }, from: '2026-10-09' })
    expect(await s.dated(s.saibling)).toMatchObject([{ from: '2026-10-09', fields: { price: { amount: 1490 } }, by: people.cook }])
  })

  it.each([
    ['a day that is not a day', { from: '1.11.2026' }, 'errors.dayInvalid'],
    ['today', { from: '2026-10-08' }, 'errors.dayNotAhead'],
    ['more than a year ahead', { from: '2027-10-09' }, 'errors.dayTooFarAhead'],
    ['with publish', { publish: true }, 'errors.datedNotWith'],
    ['with another language', { locale: 'en' }, 'errors.datedNotWith'],
  ])('refuses %s', async (_, extra, key) => {
    const s = await datedSetup()
    expect(await errorOf(s.plan(1450, '2026-10-09', extra))).toMatchObject({ key })
    expect(await s.dated(s.saibling)).toEqual([])
  })

  // Wrong behaviour caught: the history names a field that was given with its online value and so is not in the change.
  it('the history names only the fields the change keeps', async () => {
    const s = await datedSetup()
    await s.plan(1450, '2026-10-09', { fields: { price: { amount: 1450 }, veg: 'none' } })
    expect(await s.dated(s.saibling)).toMatchObject([{ fields: { price: { amount: 1450 } } }])
    expect((await s.history(s.saibling)).at(-1)).toMatchObject({ msg: { key: 'history.datedSaved', params: { fields: { de: 'Preis' } } } })
  })

  // Wrong behaviour caught (G8): a save that takes a field out of the day's change (gives it its online value) leaves no
  // trace of that, names the field as planned ("Vegan from 9 Oct"), or, emptying the change, is logged as a save.
  it.each([
    ['takes one field out', { price: { amount: 1450 }, veg: 'none' }, [['dated', 'history.datedSaved', 'Preis'], ['datedCancelled', 'history.datedCancelled', 'Vegetarisch']]],
    ['gives only the field it takes out', { veg: 'none' }, [['datedCancelled', 'history.datedCancelled', 'Vegetarisch']]],
    ['empties the change', { price: { amount: 1350 }, veg: 'none' }, [['datedCancelled', 'history.datedCancelled', 'Preis, Vegetarisch']]],
  ])('a save that %s names what it takes out as cancelled', async (_, fields, lines) => {
    const s = await datedSetup()
    await s.plan(1450, '2026-10-09', { fields: { price: { amount: 1450 }, veg: 'vegan' } })
    const count = (await s.history(s.saibling)).length
    await s.plan(0, '2026-10-09', { fields })
    const written = (await s.history(s.saibling)).slice(count)
    expect(written.map((c) => [c.kind, c.msg!.key, (c.msg!.params!.fields as { de: string }).de])).toEqual(lines)
  })

  // Wrong behaviour caught (H2.13): a save that starts a stopped change again named only the fields it gave, so the
  // history did not say that the change's other fields were planned again.
  it('a save that starts a stopped change again names every field left in it', async () => {
    const s = await datedSetup()
    await s.plan(1450, '2026-10-09', { fields: { price: { amount: 1450 }, veg: 'vegan' } })
    const [row] = await s.dated(s.saibling)
    await s.t.run((ctx) => ctx.db.patch(row!._id, { stopped: { at: DAY1, reason: { code: 'failed' } }, job: undefined }))
    const count = (await s.history(s.saibling)).length
    await s.plan(0, '2026-10-09', { fields: { veg: 'none' } })
    const written = (await s.history(s.saibling)).slice(count)
    expect(written.map((c) => [c.kind, c.msg!.key, (c.msg!.params!.fields as { de: string }).de])).toEqual([['dated', 'history.datedSaved', 'Preis'], ['datedCancelled', 'history.datedCancelled', 'Vegetarisch']])
  })

  it('refuses a task that does not ask a day, and a draft', async () => {
    const s = await datedSetup()
    expect(await errorOf(s.as.cook.mutation(api.entries.save, { site: 'restaurant', opId: opId(), task: 'menu.edit', entry: s.saibling, baseRev: 1, fields: { price: { amount: 1450 } }, from: '2026-10-09' })))
      .toMatchObject({ code: 'FORBIDDEN', key: 'errors.taskCannotDate' })
    const draft = await s.as.owner.mutation(api.entries.create, { site: 'restaurant', opId: opId(), brick: 'menu', data: { category: 'starters', name: { de: 'Neu' }, price: { amount: 900 }, allergens: [], veg: 'none' } })
    expect(await errorOf(s.as.owner.mutation(api.entries.save, { site: 'restaurant', opId: opId(), entry: draft.entry, baseRev: 1, fields: { price: { amount: 950 } }, from: '2026-10-09' })))
      .toMatchObject({ key: 'errors.datedOnlyOnline' })
  })

  // Wrong behaviour caught (H2.14): a save into a stopped change starts it waiting again past the limit.
  it('takes at most 20 waiting changes per entry, a stopped one started again counts', async () => {
    const s = await datedSetup()
    await s.plan(1390, '2026-12-01')
    const [stopped] = await s.dated(s.saibling)
    await s.t.run((ctx) => ctx.db.patch(stopped!._id, { stopped: { at: DAY1, reason: { code: 'failed' } }, job: undefined }))
    for (let day = 1; day <= 20; day++) await s.plan(1400 + day, `2026-11-${String(day).padStart(2, '0')}`)
    expect(await errorOf(s.plan(1500, '2026-11-21'))).toMatchObject({ key: 'errors.tooManyDated', params: { max: 20 } })
    expect(await errorOf(s.plan(1500, '2026-12-01'))).toMatchObject({ key: 'errors.tooManyDated', params: { max: 20 } })
    // The same day still merges.
    await expect(s.plan(1500, '2026-11-20')).resolves.toMatchObject({ from: '2026-11-20' })
  })
})

describe('on the day', () => {
  // Wrong behaviour caught: the change never starts, or starts in the person's name without saying it was planned.
  it('the system writes the change at the day\'s first minute, names the planner, and the row goes', async () => {
    const s = await datedSetup()
    await s.as.cook.mutation(api.entries.save, { site: 'restaurant', opId: opId(), task: 'menu.price', entry: s.saibling, baseRev: 1, fields: { price: { amount: 1450 } }, from: '2026-10-09' })
    await s.advanceTo(DAY1 - 60_000)
    expect((await s.row(s.saibling))!.data).toMatchObject({ price: { amount: 1350 } })
    await s.advanceTo(DAY1 + 1000)
    expect((await s.row(s.saibling))!.data).toMatchObject({ price: { amount: 1450 } })
    expect(await s.dated(s.saibling)).toEqual([])
    expect((await s.history(s.saibling)).at(-1)).toMatchObject({ kind: 'save', actor: 'system', plannedBy: people.cook, msg: { key: 'history.datedApplied' } })
    const item = await s.item(s.saibling)
    expect(item.data).toMatchObject({ price: { amount: 1450 } })
    expect(item.upcoming).toBeUndefined()
  })

  // D126, a departure from spec 6a: the change was planned for that day, so it wins over an edit made since.
  it('applies even when the field was edited since', async () => {
    const s = await datedSetup()
    await s.plan(1450)
    await s.as.owner.mutation(api.entries.save, { site: 'restaurant', opId: opId(), entry: s.saibling, baseRev: 1, fields: { price: { amount: 1390 } }, publish: true })
    await s.advanceTo(DAY1 + 1000)
    expect((await s.row(s.saibling))!.data).toMatchObject({ price: { amount: 1450 } })
  })

  // Decision 10: an unpublished change and a dated change of the same field. The dated change goes online on its day;
  // the unpublished value keeps waiting and wins when someone publishes it.
  it('leaves an unpublished change of the same field waiting', async () => {
    const s = await datedSetup()
    await s.as.owner.mutation(api.entries.save, { site: 'restaurant', opId: opId(), entry: s.saibling, baseRev: 1, fields: { price: { amount: 1600 } } })
    await s.plan(1450, '2026-10-09', { baseRev: 2 })
    await s.advanceTo(DAY1 + 1000)
    expect((await s.row(s.saibling))!.data).toMatchObject({ price: { amount: 1450 } })
    const pending = await s.t.run((ctx) => ctx.db.query('pendingChanges').withIndex('by_entry', (q) => q.eq('entry', s.saibling)).collect())
    expect(pending).toMatchObject([{ fields: { price: { amount: 1600 } } }])
  })

  // Wrong behaviour caught: a change that can no longer be written fails at night and nobody hears of it.
  it('a change that fails the check stops: kept with its reason, mailed, on Today; a new day starts it again', async () => {
    const s = await datedSetup()
    await s.plan(1450)
    const [change] = await s.dated(s.saibling)
    await s.t.run((ctx) => ctx.db.patch(change!._id, { fields: { price: { amount: -5 } } }))
    await s.advanceTo(DAY1 + 1000)
    expect((await s.row(s.saibling))!.data).toMatchObject({ price: { amount: 1350 } })
    const [stopped] = await s.dated(s.saibling)
    expect(stopped).toMatchObject({ stopped: { at: DAY1, reason: { code: 'invalid' } } })
    expect(stopped!.job).toBeUndefined()
    const mails = await s.t.run((ctx) => ctx.db.query('outbox').collect())
    expect(mails.map((m) => m.to)).toEqual(['wirtin@example.com'])
    expect(mails[0]!.subject).toContain('Gebeizter Saibling')
    const today = await s.as.owner.query(api.entries.stoppedPlans, { site: 'restaurant' })
    expect(today).toMatchObject([{ entry: s.saibling, change: { id: change!._id, from: '2026-10-09' } }])
    expect((await s.item(s.saibling)).upcoming).toBeUndefined()
    // A backup leaves it behind and says how many (R3 point 13).
    expect(await s.t.query(internal.backup.snapshot, { site: s.site })).toMatchObject({ stoppedChanges: 1 })

    await s.t.run((ctx) => ctx.db.patch(change!._id, { fields: { price: { amount: 1450 } } }))
    await s.as.owner.mutation(api.datedChanges.setDay, { site: 'restaurant', opId: opId(), change: change!._id, from: '2026-10-10' })
    expect((await s.dated(s.saibling))[0]!.stopped).toBeUndefined()
    await s.advanceTo(DAY1 + 24 * 3600_000 + 1000)
    expect((await s.row(s.saibling))!.data).toMatchObject({ price: { amount: 1450 } })
  })
  // Wrong behaviour caught: in Havana the clock jumps from 23:59 to 01:00 when summer time starts, so a run planned for
  // "00:00" lands on the day before and plans itself for that same instant without end.
  it('a change for the day summer time starts in Havana runs once, at the jump', async () => {
    const s = await datedSetup()
    await s.t.run(async (ctx) => {
      const schema = (await ctx.db.get(s.site))!.schema as Schema
      await ctx.db.patch(s.site, { schema: { ...schema, timeZone: 'America/Havana' } })
    })
    await s.plan(1450, '2027-03-14')
    const jump = Date.parse('2027-03-14T05:00:00Z')
    await s.advanceTo(jump - 3600_000)
    expect((await s.row(s.saibling))!.data).toMatchObject({ price: { amount: 1350 } })
    await s.advanceTo(jump + 120_000)
    expect((await s.row(s.saibling))!.data).toMatchObject({ price: { amount: 1450 } })
    expect(await s.dated(s.saibling)).toEqual([])
  })

  // Wrong behaviour caught: the run gives a draft whose name is not fixed a new title but keeps the old name and address,
  // which a save would have changed. Reached by an entry imported online from an export without a fixed name.
  it('a new title written into a draft whose name is not fixed renames it, as a save does', async () => {
    const s = await datedSetup()
    await s.t.run(async (ctx) => {
      const schema = (await ctx.db.get(s.site))!.schema as Schema
      await ctx.db.patch(s.site, { schema: { ...schema, locales: ['de'] } })
    })
    const made = await s.as.owner.mutation(api.entries.create, { site: 'restaurant', opId: opId(), brick: 'events', data: { title: { de: 'Herbstfest' }, when: { from: '2026-11-20', to: '2026-11-20' }, description: { de: 'Test' } }, publish: {} })
    const entry = made.entry as Id<'entries'>
    await s.t.run((ctx) => ctx.db.patch(entry, { nameFixed: undefined }))
    await s.as.owner.mutation(api.entries.save, { site: 'restaurant', opId: opId(), entry, baseRev: 1, fields: { title: { de: 'Martinsfest' } }, from: '2026-10-09' })
    await s.as.owner.mutation(api.entries.unpublish, { site: 'restaurant', opId: opId(), entry, lifeRev: (await s.row(entry))!.lifeRev })
    await s.advanceTo(DAY1 + 1000)
    const row = (await s.row(entry))!
    expect([row.name, (row.data as { slug: Record<string, string> }).slug.de]).toEqual(['martinsfest', 'martinsfest'])
  })

  // Wrong behaviour caught: an error that is not a refusal (here a stored choice field without its options) makes the
  // run fail silently; the change then neither starts nor says that it stopped.
  // Wrong behaviour caught (G5): a refusal while writing (the site reached its storage budget since the change was planned)
  // is taken as an error of the run ("failed", "tell us"), or as fields that no longer pass, though the cause is the budget.
  it('a refusal while writing stops the change as invalid with the refusal as its cause', async () => {
    const s = await datedSetup()
    await s.plan(14500)
    await s.t.run(async (ctx) => { await ctx.db.patch(s.site, { bytes: BUDGET.siteBytes }) })
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    await s.advanceTo(DAY1 + 1000)
    expect((await s.row(s.saibling))!.data).toMatchObject({ price: { amount: 1350 } })
    const [stopped] = await s.dated(s.saibling)
    expect(stopped!.stopped!.reason).toEqual({ code: 'invalid', fields: ['price'], cause: { key: 'errors.siteStorageLimitReached', params: { used: '4.1 MB', limit: '4 MB', over: '1 KB' } } })
    expect(log).not.toHaveBeenCalled()
    const today = await s.as.owner.query(api.entries.stoppedPlans, { site: 'restaurant' })
    expect(today[0]!.causeText).toBe('Die Werte ließen sich nicht speichern: Der Textspeicher der Seite ist voll (4.1 MB von 4 MB). Kürze oder entferne Einträge. Änderungen, die nichts vergrößern, lassen sich immer speichern.')
    log.mockRestore()
  })

  // Wrong behaviour caught (H2.15): a ConvexError without a message key out of the write (none of the product's own
  // throws today) stopped the change as fields that are "missing or not valid", which no field is. Tested on the function
  // `applyDue` decides with: no write path throws such an error to reach it through the run, and only mail and the clock
  // are mocked.
  it.each([
    ['a refusal with its message', new ConvexError({ code: 'TOO_LARGE', key: 'errors.entryTooComplex' }), { code: 'invalid', fields: ['price'], cause: { key: 'errors.entryTooComplex' } }],
    ['a ConvexError without a message key', new ConvexError({ code: 'INVALID' }), { code: 'failed' }],
    ['another error', new TypeError('x'), { code: 'failed' }],
  ])('the stop of a write that threw: %s', (_, error, reason) => {
    expect(writeStop(error, ['price'])).toEqual(reason)
  })

  it('an error of the run stops the change with "failed" and logs only the class', async () => {
    const s = await datedSetup()
    await s.plan(1450)
    await s.t.run(async (ctx) => {
      const schema = (await ctx.db.get(s.site))!.schema as Schema
      delete (schema.bricks.menu!.fields.veg as { options?: unknown }).options
      await ctx.db.patch(s.site, { schema })
    })
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    await s.advanceTo(DAY1 + 1000)
    expect((await s.row(s.saibling))!.data).toMatchObject({ price: { amount: 1350 } })
    const [stopped] = await s.dated(s.saibling)
    expect([stopped!.stopped, stopped!.job]).toEqual([{ at: DAY1, reason: { code: 'failed' } }, undefined])
    expect(log.mock.calls).toEqual([[`Dated change ${stopped!._id} failed (TypeError).`]])
    const line = (await s.history(s.saibling)).find((c) => c.kind === 'datedStopped')!
    expect(line.msg).toMatchObject({ params: { why: { key: 'stopped.because.changeFailed' } } })
    const today = await s.as.owner.query(api.entries.stoppedPlans, { site: 'restaurant' })
    expect(today[0]!.causeText).toBe('Beim Übernehmen ist ein Fehler aufgetreten. Gib der Änderung einen neuen Tag. Wenn es wieder passiert, melde dich bitte bei uns.')
    log.mockRestore()
  })

  // Wrong behaviour caught: saving the same values into a stopped change is taken as "nothing changed", so it stays
  // stopped although the person planned it again. Reached when the site's today moves back (a new time zone).
  it('saving the same values into a stopped change starts it again', async () => {
    const s = await datedSetup()
    await s.plan(1450)
    const [change] = await s.dated(s.saibling)
    await s.t.run((ctx) => ctx.db.patch(change!._id, { fields: { price: { amount: -5 } } }))
    await s.advanceTo(DAY1 + 1000)
    await s.t.run(async (ctx) => {
      await ctx.db.patch(change!._id, { fields: { price: { amount: 1450 } } })
      const schema = (await ctx.db.get(s.site))!.schema as Schema
      await ctx.db.patch(s.site, { schema: { ...schema, timeZone: 'Pacific/Honolulu' } })
    })
    await s.plan(1450)
    const [again] = await s.dated(s.saibling)
    expect([again!._id, again!.stopped, !!again!.job]).toEqual([change!._id, undefined, true])
    await s.advanceTo(DAY1 + 24 * 3600_000)
    expect((await s.row(s.saibling))!.data).toMatchObject({ price: { amount: 1450 } })
  })
})

describe('moving and cancelling', () => {
  it('a moved change starts on its new day only', async () => {
    const s = await datedSetup()
    await s.plan(1450)
    const [change] = await s.dated(s.saibling)
    await s.as.owner.mutation(api.datedChanges.setDay, { site: 'restaurant', opId: opId(), change: change!._id, from: '2026-11-03' })
    await s.advanceTo(DAY1 + 1000)
    expect((await s.row(s.saibling))!.data).toMatchObject({ price: { amount: 1350 } })
    expect(await s.dated(s.saibling)).toMatchObject([{ from: '2026-11-03' }])
  })

  // Wrong behaviour caught: a moved change drops a field that holds its online value on the new day but keeps holding
  // the field's file, so the file is never swept once the entry lets go of it.
  it('a moved change lets go of the file of a field it no longer sets', async () => {
    const s = await datedSetup()
    await s.t.run(async (ctx) => {
      const schema = (await ctx.db.get(s.site))!.schema as Schema
      schema.bricks.menu!.fields.card = { type: 'file', label: 'Karte', accept: ['pdf'], maxBytes: 1024 * 1024, optional: true }
      await ctx.db.patch(s.site, { schema })
    })
    const file = await upload(s)
    await s.plan(1450, '2026-10-20', { fields: { price: { amount: 1450 }, card: { file } } })
    await s.as.owner.mutation(api.entries.save, { site: 'restaurant', opId: opId(), entry: s.saibling, baseRev: 1, fields: { card: { file } }, publish: true })
    const [change] = await s.dated(s.saibling)
    await s.as.owner.mutation(api.datedChanges.setDay, { site: 'restaurant', opId: opId(), change: change!._id, from: '2026-10-25' })
    expect((await s.dated(s.saibling))[0]!.fields).toEqual({ price: { amount: 1450 } })
    const held = await s.t.run((ctx) => ctx.db.query('fileRefs').withIndex('by_holder', (q) => q.eq('holder', 'dated').eq('holderId', change!._id)).collect())
    expect(held).toEqual([])
  })

  it('cancel removes the change and its run; the bundle no longer announces it', async () => {
    const s = await datedSetup()
    await s.plan(1450)
    const [change] = await s.dated(s.saibling)
    const rev = await s.contentRev()
    await s.as.owner.mutation(api.datedChanges.cancel, { site: 'restaurant', opId: opId(), change: change!._id })
    expect(await s.dated(s.saibling)).toEqual([])
    expect(await s.contentRev()).toBe(rev + 1)
    await s.advanceTo(DAY1 + 1000)
    expect((await s.row(s.saibling))!.data).toMatchObject({ price: { amount: 1350 } })
  })

  // Wrong behaviour caught: a removed entry keeps its waiting values, which a restore would bring back unasked.
  it('removing the entry cancels its changes with one history row; restoring does not bring them back', async () => {
    const s = await datedSetup()
    await s.plan(1450)
    await s.plan(1490, '2026-12-01')
    await s.as.owner.mutation(api.entries.save, { site: 'restaurant', opId: opId(), entry: s.saibling, baseRev: 1, fields: { veg: 'vegan' } })
    const pending = () => s.t.run((ctx) => ctx.db.query('pendingChanges').withIndex('by_entry', (q) => q.eq('entry', s.saibling)).collect())
    expect(await pending()).toHaveLength(1)
    const lifeRev = (await s.row(s.saibling))!.lifeRev
    await s.as.owner.mutation(api.entries.remove, { site: 'restaurant', opId: opId(), entry: s.saibling, lifeRev })
    expect(await s.dated(s.saibling)).toEqual([])
    expect(await pending()).toEqual([])
    expect((await s.history(s.saibling)).filter((c) => c.kind === 'datedCancelled')).toMatchObject([{ msg: { key: 'history.datedCancelledWithEntry', params: { count: 2 } } }])
    await s.as.owner.mutation(api.entries.restore, { site: 'restaurant', opId: opId(), entry: s.saibling, lifeRev: lifeRev + 1 })
    expect(await s.dated(s.saibling)).toEqual([])
    expect(await pending()).toEqual([])
  })
})

describe('every field sent is meant', () => {
  // Wrong behaviour caught: a value equal to what an earlier waiting change gives was dropped, so the second change was
  // lost (or moved away) and cancelling the first took the price back to the old one.
  it.each([
    ['a save', async (s: Awaited<ReturnType<typeof datedSetup>>) => { await s.plan(1450, '2026-11-01') }],
    ['a publish from a day', async (s: Awaited<ReturnType<typeof datedSetup>>) => {
      await s.as.owner.mutation(api.entries.save, { site: 'restaurant', opId: opId(), entry: s.saibling, baseRev: 1, fields: { price: { amount: 1450 } } })
      await s.as.owner.mutation(api.entries.publish, { site: 'restaurant', opId: opId(), entry: s.saibling, lifeRev: (await s.row(s.saibling))!.lifeRev, from: '2026-11-01' })
    }],
    ['a moved change', async (s: Awaited<ReturnType<typeof datedSetup>>) => {
      await s.plan(1450, '2026-12-01')
      const later = (await s.dated(s.saibling)).find((r) => r.from === '2026-12-01')!
      await s.as.owner.mutation(api.datedChanges.setDay, { site: 'restaurant', opId: opId(), change: later._id, from: '2026-11-01' })
    }],
  ])('%s keeps a value that an earlier change already gives', async (_, act) => {
    const s = await datedSetup()
    await s.plan(1450)
    await act(s)
    expect((await s.dated(s.saibling)).map((r) => [r.from, r.fields]).sort()).toEqual([['2026-10-09', { price: { amount: 1450 } }], ['2026-11-01', { price: { amount: 1450 } }]])
  })

  // Wrong behaviour caught (G4): an earlier change that stopped still counted as setting the field, so a later save of
  // the online value was stored as a change that changes nothing.
  it('a stopped earlier change gives nothing: the online value is no change', async () => {
    const s = await datedSetup()
    await s.plan(1450, '2026-11-01')
    const [first] = await s.dated(s.saibling)
    await s.t.run((ctx) => ctx.db.patch(first!._id, { stopped: { at: DAY1, reason: { code: 'invalid', fields: ['price'] } }, job: undefined }))
    const result = await s.plan(1350, '2026-12-01')
    expect(['dated' in (result as object), (await s.dated(s.saibling)).map((r) => r.from)]).toEqual([false, ['2026-11-01']])
  })
})

describe('a new change against the changes that wait (round F)', () => {
  /** The saibling with a note shown on a switch: `showNote` false, `note` "x", the note required while shown. */
  async function noteSetup() {
    const s = await datedSetup()
    await s.t.run(async (ctx) => {
      const schema = (await ctx.db.get(s.site))!.schema as Schema
      schema.bricks.menu!.fields.showNote = { type: 'boolean', label: 'Hinweis zeigen', optional: true }
      schema.bricks.menu!.fields.note = { type: 'text', label: 'Hinweis', max: 40, translate: false, showWhen: { field: 'showNote', is: true } }
      await ctx.db.patch(s.site, { schema })
      const entry = (await ctx.db.get(s.saibling))!
      await ctx.db.patch(s.saibling, { data: { ...entry.data, showNote: false, note: 'x' } })
    })
    const save = (fields: Record<string, unknown>, from: string) => s.as.owner.mutation(api.entries.save, { site: 'restaurant', opId: opId(), entry: s.saibling, baseRev: 1, fields, from })
    return { ...s, save }
  }

  // Row 8. Wrong behaviour caught: only the problems the check gave to the new change refused it, so a change that
  // clears a field a later waiting change shows passed, and the later change stopped on its day.
  it('refuses a change that breaks a later waiting change, and names that day', async () => {
    const s = await noteSetup()
    await s.save({ showNote: true }, '2026-10-10')
    const error = await errorOf(s.save({ note: null }, '2026-10-09'))
    expect(error).toMatchObject({ code: 'INVALID', details: { errors: [{ path: 'note', code: 'REQUIRED', message: expect.stringContaining('2026-10-10') }] } })
    expect((await s.dated(s.saibling)).map((r) => r.from)).toEqual(['2026-10-10'])
  })

  // Wrong behaviour caught: the same, for a change moved to a day before a change that then breaks.
  it('refuses moving a change to a day where a later waiting change breaks', async () => {
    const s = await noteSetup()
    await s.save({ note: null }, '2026-10-12')
    await s.save({ showNote: true, note: 'y' }, '2026-10-15')
    const moved = (await s.dated(s.saibling)).find((r) => r.from === '2026-10-15')!
    const error = await errorOf(s.as.owner.mutation(api.datedChanges.setDay, { site: 'restaurant', opId: opId(), change: moved._id, from: '2026-10-10' }))
    expect(error).toMatchObject({ code: 'INVALID', details: { errors: [{ path: 'note', code: 'REQUIRED', message: expect.stringContaining('2026-10-12') }] } })
    expect((await s.dated(s.saibling)).map((r) => r.from).sort()).toEqual(['2026-10-12', '2026-10-15'])
  })

  // Row 9. Wrong behaviour caught: a waiting change that broke by itself (the entry was edited after it) blocks every
  // other change of the entry.
  it('accepts a change of another field while a waiting change is broken by itself', async () => {
    const s = await noteSetup()
    await s.save({ note: null }, '2026-10-10')
    await s.as.owner.mutation(api.entries.save, { site: 'restaurant', opId: opId(), entry: s.saibling, baseRev: 1, fields: { showNote: true }, publish: true })
    await s.plan(1450, '2026-10-09', { baseRev: 2 })
    expect((await s.dated(s.saibling)).map((r) => [r.from, r.fields]).sort()).toEqual([['2026-10-09', { price: { amount: 1450 } }], ['2026-10-10', { note: null }]])
  })
})

describe('publishing unpublished changes on a day', () => {
  it('turns the unpublished changes into one dated change and refuses a time for an online entry', async () => {
    const s = await datedSetup()
    await s.as.owner.mutation(api.entries.save, { site: 'restaurant', opId: opId(), entry: s.saibling, baseRev: 1, fields: { price: { amount: 1450 } } })
    const lifeRev = (await s.row(s.saibling))!.lifeRev
    // A day and a time together are refused too (wrong behaviour caught: the time was dropped without a word).
    for (const both of [{ at: DAY1 }, { at: DAY1, from: '2026-10-09' }]) {
      expect(await errorOf(s.as.owner.mutation(api.entries.publish, { site: 'restaurant', opId: opId(), entry: s.saibling, lifeRev, ...both })))
        .toMatchObject({ key: 'errors.liveTakesDay' })
    }
    await s.as.owner.mutation(api.entries.publish, { site: 'restaurant', opId: opId(), entry: s.saibling, lifeRev, from: '2026-10-09' })
    expect(await s.dated(s.saibling)).toMatchObject([{ from: '2026-10-09', fields: { price: { amount: 1450 } } }])
    expect(await s.t.run((ctx) => ctx.db.query('pendingChanges').withIndex('by_entry', (q) => q.eq('entry', s.saibling)).collect())).toEqual([])
  })

  it('refuses the whole call when one unpublished field may not start on a day', async () => {
    const s = await datedSetup()
    await s.as.owner.mutation(api.entries.save, { site: 'restaurant', opId: opId(), entry: s.saibling, baseRev: 1, fields: { price: { amount: 1450 }, name: { de: 'Saibling neu' } } })
    const lifeRev = (await s.row(s.saibling))!.lifeRev
    expect(await errorOf(s.as.owner.mutation(api.entries.publish, { site: 'restaurant', opId: opId(), entry: s.saibling, lifeRev, from: '2026-10-09' })))
      .toMatchObject({ key: 'errors.fieldsCannotDate' })
    expect(await s.dated(s.saibling)).toEqual([])
  })
})

describe('a dated change that needs a yes', () => {
  async function proposed() {
    const s = await datedSetup({ needsApproval: true })
    const sent = await s.as.cook.mutation(api.entries.save, { site: 'restaurant', opId: opId(), task: 'menu.price', entry: s.saibling, baseRev: 1, fields: { price: { amount: 1450 } }, from: '2026-10-09' }) as unknown as Proposed
    expect(sent.proposal).toBeDefined()
    expect(await s.dated(s.saibling)).toEqual([])
    return { ...s, sent }
  }

  // Wrong behaviour caught (I2.1): the asker's form reopened the request without its day, so sending it again asked
  // for the change now.
  it('the asker\'s own request names its day', async () => {
    const s = await proposed()
    expect(await s.as.cook.query(api.proposals.ownFor, { site: 'restaurant', entry: s.saibling })).toMatchObject({ proposal: s.sent.proposal, from: '2026-10-09' })
  })

  it('a yes before the day makes the change in the asker\'s name', async () => {
    const s = await proposed()
    await s.as.owner.mutation(api.proposals.approve, { proposal: s.sent.proposal })
    expect(await s.dated(s.saibling)).toMatchObject([{ from: '2026-10-09', by: people.cook }])
    expect((await s.row(s.saibling))!.data).toMatchObject({ price: { amount: 1350 } })
  })

  it('a yes on or after the day writes it online at once, as late', async () => {
    const s = await proposed()
    await s.advanceTo(DAY1 + 3600_000)
    await s.as.owner.mutation(api.proposals.approve, { proposal: s.sent.proposal })
    expect(await s.dated(s.saibling)).toEqual([])
    expect((await s.row(s.saibling))!.data).toMatchObject({ price: { amount: 1450 } })
    expect((await s.history(s.saibling)).at(-1)).toMatchObject({ msg: { key: 'history.datedAppliedLate' } })
  })

  // Wrong behaviour caught (G3): a field that a change may no longer set since the request (here it became the field
  // that says until when the dish shows) was written by a late yes, although the run on the day would have stopped it.
  it('a late yes refuses a field a change may no longer set, as the run would', async () => {
    const s = await proposed()
    await s.t.run(async (ctx) => {
      const schema = (await ctx.db.get(s.site))!.schema as Schema
      ;(schema.bricks.menu as { showUntil?: { field: string } }).showUntil = { field: 'price' }
      await ctx.db.patch(s.site, { schema })
    })
    await s.advanceTo(DAY1 + 3600_000)
    const answer = await s.as.owner.mutation(api.proposals.approve, { proposal: s.sent.proposal })
    expect(answer).toMatchObject({ status: 'stale' })
    expect((await s.row(s.saibling))!.data).toMatchObject({ price: { amount: 1350 } })
  })

  // Wrong behaviour caught: staff whose change needs a yes take away someone else's planned price without one, or move
  // a change to another day past the yes; their own approved change they may still cancel.
  it('staff who need a yes cancel only their own change and move none', async () => {
    const s = await proposed()
    await s.as.owner.mutation(api.proposals.approve, { proposal: s.sent.proposal })
    await s.plan(1490, '2026-12-01')
    const [own, other] = await s.dated(s.saibling)
    const as = { site: 'restaurant', task: 'menu.price' }
    expect(await errorOf(s.as.cook.mutation(api.datedChanges.cancel, { ...as, opId: opId(), change: other!._id }))).toMatchObject({ code: 'FORBIDDEN', key: 'errors.needsApprovalProposeAgain' })
    expect(await errorOf(s.as.cook.mutation(api.datedChanges.setDay, { ...as, opId: opId(), change: own!._id, from: '2026-10-20' }))).toMatchObject({ code: 'FORBIDDEN', key: 'errors.needsApprovalProposeAgain' })
    await s.as.cook.mutation(api.datedChanges.cancel, { ...as, opId: opId(), change: own!._id })
    expect(await s.dated(s.saibling)).toMatchObject([{ _id: other!._id }])
  })

  // Wrong behaviour caught (G7): the editor offered "Tag ändern" and "Änderung aufheben" where the steps refuse them.
  it('the list says per change what the person may do, by the rule of the steps', async () => {
    const s = await proposed()
    await s.as.owner.mutation(api.proposals.approve, { proposal: s.sent.proposal })
    await s.plan(1490, '2026-12-01')
    const steps = async (who: 'owner' | 'cook') => (await s.as[who].query(api.datedChanges.list, { site: 'restaurant', entry: s.saibling, task: 'menu.price' }))
      .map((c) => [c.from, c.mayCancel, c.mayMove])
    expect(await steps('cook')).toEqual([['2026-10-09', true, false], ['2026-12-01', false, false]])
    expect(await steps('owner')).toEqual([['2026-10-09', true, true], ['2026-12-01', true, true]])
  })

  // Wrong behaviour caught (H2.12): a request approved into the owner's change of that day made the asker its `by`, so
  // they could cancel the owner's planned values with it, without a yes.
  it('staff cannot cancel a change that holds someone else\'s values too', async () => {
    const s = await datedSetup({ needsApproval: true })
    await s.t.run(async (ctx) => {
      const schema = (await ctx.db.get(s.site))!.schema as Schema
      for (const task of schema.bricks.menu!.tasks ?? []) if (task.id === 'price') (task as { fields: string[] }).fields = ['price', 'veg']
      await ctx.db.patch(s.site, { schema })
    })
    await s.as.owner.mutation(api.entries.save, { site: 'restaurant', opId: opId(), entry: s.saibling, baseRev: 1, fields: { veg: 'vegan' }, from: '2026-10-09' })
    const sent = await s.as.cook.mutation(api.entries.save, { site: 'restaurant', opId: opId(), task: 'menu.price', entry: s.saibling, baseRev: 1, fields: { price: { amount: 1450 } }, from: '2026-10-09' }) as unknown as Proposed
    await s.as.owner.mutation(api.proposals.approve, { proposal: sent.proposal })
    const [row] = await s.dated(s.saibling)
    expect([row!.by, row!.shared, Object.keys(row!.fields).sort()]).toEqual([people.cook, true, ['price', 'veg']])
    const as = { site: 'restaurant', task: 'menu.price' }
    expect(await errorOf(s.as.cook.mutation(api.datedChanges.cancel, { ...as, opId: opId(), change: row!._id }))).toMatchObject({ code: 'FORBIDDEN', key: 'errors.needsApprovalProposeAgain' })
    expect((await s.as.cook.query(api.datedChanges.list, { site: 'restaurant', entry: s.saibling, task: 'menu.price' })).map((c) => c.mayCancel)).toEqual([false])
    await s.as.owner.mutation(api.datedChanges.cancel, { site: 'restaurant', opId: opId(), change: row!._id })
    expect(await s.dated(s.saibling)).toEqual([])
  })

  // Wrong behaviour caught: a late yes publishes like a save with "publish now" and so throws away an unpublished
  // change of the same field, which the run on the day leaves waiting.
  it('a late yes writes what the run would: an unpublished change of the field keeps waiting', async () => {
    const s = await datedSetup({ needsApproval: true })
    await s.as.owner.mutation(api.entries.save, { site: 'restaurant', opId: opId(), entry: s.saibling, baseRev: 1, fields: { price: { amount: 1600 } } })
    const sent = await s.as.cook.mutation(api.entries.save, { site: 'restaurant', opId: opId(), task: 'menu.price', entry: s.saibling, baseRev: 2, fields: { price: { amount: 1450 } }, from: '2026-10-09' }) as unknown as Proposed
    await s.advanceTo(DAY1 + 3600_000)
    await s.as.owner.mutation(api.proposals.approve, { proposal: sent.proposal })
    expect((await s.row(s.saibling))!.data).toMatchObject({ price: { amount: 1450 } })
    const pending = await s.t.run((ctx) => ctx.db.query('pendingChanges').withIndex('by_entry', (q) => q.eq('entry', s.saibling)).collect())
    expect(pending).toMatchObject([{ fields: { price: { amount: 1600 } } }])
  })
})

describe('export and import', () => {
  it('a backup carries the waiting changes; an import writes a passed day into the fields and plans the rest', async () => {
    const s = await datedSetup()
    await s.plan(1450)
    const snapshot = await s.t.query(internal.backup.snapshot, { site: s.site })
    expect(snapshot.entries.find((e) => e.id === s.saibling)).toMatchObject({ changes: [{ from: '2026-10-09', set: { price: { amount: 1450 } } }] })

    vi.stubEnv('GINKO_LOCAL', '1')
    const dish = { category: 'starters', name: { de: 'Forelle' }, price: { amount: 1200 }, allergens: ['D'], veg: 'none' }
    await s.t.mutation(internal.seed.importExport, {
      site: 'restaurant', files: [],
      entries: [{ id: 'm1', brick: 'menu', kind: 'item', order: 99, prints: {}, rev: 1, data: dish, changes: [{ from: '2026-10-01', set: { price: { amount: 1250 } } }, { from: '2026-12-01', set: { price: { amount: 1300 } } }] }],
    })
    const menu = await s.t.run((ctx) => ctx.db.query('entries').withIndex('by_site_brick_order', (q) => q.eq('site', s.site).eq('brick', 'menu')).collect())
    const trout = menu.find((e) => (e.data as { name: { de: string } }).name.de === 'Forelle')!
    expect(trout.data).toMatchObject({ price: { amount: 1250 } })
    expect(await s.dated(trout._id)).toMatchObject([{ from: '2026-12-01', fields: { price: { amount: 1300 } } }])
    expect((await s.dated(trout._id))[0]!.by).toBeUndefined()
  })

  // Wrong behaviour caught: an import stores more waiting changes than a save may make, or an entry that outgrows the
  // budget once its changes are applied, which then stops on its day.
  it('an import refuses more than 20 waiting changes and an entry too large with its changes applied', async () => {
    const s = await datedSetup()
    vi.stubEnv('GINKO_LOCAL', '1')
    const dish = { category: 'starters', name: { de: 'Forelle' }, price: { amount: 1200 }, allergens: ['D'], veg: 'none' }
    const days = Array.from({ length: 21 }, (_, i) => ({ from: `2026-11-${String(i + 1).padStart(2, '0')}`, set: { price: { amount: 1300 + i } } }))
    const many = await errorOf(s.t.mutation(internal.seed.importExport, { site: 'restaurant', files: [], entries: [{ id: 'm1', brick: 'menu', kind: 'item', order: 99, prints: {}, rev: 1, data: dish, changes: days }] }))
    expect(many.details).toMatchObject({ problems: [{ key: 'errors.importTooManyDated', params: { id: 'm1', count: 21, max: 20 } }] })
    // A longer limit on the description, so a change can hold a text that takes the entry over the budget.
    await s.t.run(async (ctx) => {
      const schema = (await ctx.db.get(s.site))!.schema as Schema
      ;(schema.bricks.menu!.fields.description as { max?: number }).max = 600_000
      await ctx.db.patch(s.site, { schema })
    })
    const long = { de: 'x'.repeat(500_000) }
    const large = await errorOf(s.t.mutation(internal.seed.importExport, { site: 'restaurant', files: [], entries: [{ id: 'm2', brick: 'menu', kind: 'item', order: 99, prints: {}, rev: 1, data: dish, changes: [{ from: '2026-12-01', set: { description: long } }] }] }))
    expect(large.details).toMatchObject({ problems: expect.arrayContaining([expect.objectContaining({ key: 'errors.importEntryTooLarge', params: expect.objectContaining({ id: 'm2' }) })]) })
  })
})

// The case behind slice 2 (made-up values): a practice keeps one price as a fact that its texts quote, and a staff member
// changes it today for a later day through a task that asks the day.
describe('a price fact changed for a later day', () => {
  // Wrong behaviour caught: the new price shows before its day (on the page or in the quoted fact), never shows, or the
  // history no longer says who planned it once the system wrote it.
  it('the page and the fact show the new price from its day, and the history names the planner', async () => {
    const s = await datedSetup()
    const contact = s.entries.contact!
    await s.t.run(async (ctx) => {
      const schema = (await ctx.db.get(s.site))!.schema as Schema
      const brick = schema.bricks.contact! as Schema['bricks'][string] & { timeline?: { public: string[] } }
      brick.fields.price = { type: 'money', label: { de: 'Einzelstunde', en: 'Single session' }, optional: true } as never
      brick.timeline = { public: ['price'] }
      brick.tasks = [...(brick.tasks ?? []), { id: 'price', label: { de: 'Preis ändern', en: 'Change the price' }, kind: 'edit', fields: ['price'], when: { from: 'ask' } } as never]
      schema.components = { ...schema.components, fact: factComponent(['contact.price'], schema.bricks) }
      await ctx.db.patch(s.site, { schema })
      const row = (await ctx.db.get(contact))!
      await ctx.db.patch(contact, { data: { ...row.data, price: { amount: 9000 } } })
      const cook = (await ctx.db.query('memberships').collect()).find((m) => m.user === people.cook)!
      await ctx.db.patch(cook._id, { grants: [...cook.grants, 'contact.price'] })
    })
    const rev = (await s.row(contact))!.rev
    const fact = async () => (await s.as.owner.query(api.facts.values, { site: 'restaurant' })).find((f) => f.name === 'contact.price')!
    const page = async () => ((await (await s.t.fetch('/bundle/restaurant?format=3&locale=de')).json()) as { bricks: { contact: { data: Record<string, unknown>; upcoming?: unknown[] } } }).bricks.contact

    await s.as.cook.mutation(api.entries.save, { site: 'restaurant', opId: opId(), task: 'contact.price', entry: contact, baseRev: rev, fields: { price: { amount: 9500 } }, from: '2026-10-09' })
    expect((await fact()).text).toMatch(/90/)
    expect(await fact()).toMatchObject({ next: { from: '2026-10-09', text: expect.stringMatching(/95/) } })
    expect(await page()).toMatchObject({ data: { price: { amount: 9000 } }, upcoming: [{ from: '2026-10-09', data: { price: { amount: 9500 } } }] })

    await s.advanceTo(DAY1 + 1000)
    expect((await fact()).text).toMatch(/95/)
    expect((await fact()).next).toBeUndefined()
    const after = await page()
    expect(after.data).toMatchObject({ price: { amount: 9500 } })
    expect(after.upcoming).toBeUndefined()
    const history = await s.as.owner.query(api.changes.list, { site: 'restaurant', entry: contact, paginationOpts: { numItems: 5, cursor: null } })
    expect(history.page[0]).toMatchObject({ actor: 'system', msg: { key: 'history.datedApplied' }, planner: expect.objectContaining({ email: 'koch@example.com' }) })
    expect((await s.history(contact)).at(-1)).toMatchObject({ plannedBy: people.cook })
  })

  // R4 C10. Wrong behaviour caught: a stopped change, which will never come, is still quoted as the fact's next value.
  it('a stopped change is not the fact\'s next value', async () => {
    const s = await datedSetup()
    await s.t.run(async (ctx) => {
      const schema = (await ctx.db.get(s.site))!.schema as Schema
      const brick = schema.bricks.contact! as Schema['bricks'][string] & { timeline?: { public: string[] } }
      brick.fields.price = { type: 'money', label: { de: 'Einzelstunde', en: 'Single session' }, optional: true } as never
      brick.timeline = { public: ['price'] }
      schema.components = { ...schema.components, fact: factComponent(['contact.price'], schema.bricks) }
      await ctx.db.patch(s.site, { schema })
      const row = (await ctx.db.get(s.entries.contact!))!
      await ctx.db.patch(s.entries.contact!, { data: { ...row.data, price: { amount: 9000 } } })
    })
    const contact = s.entries.contact!
    await s.as.owner.mutation(api.entries.save, { site: 'restaurant', opId: opId(), entry: contact, baseRev: (await s.row(contact))!.rev, fields: { price: { amount: 9500 } }, from: '2026-10-09' })
    const fact = async () => (await s.as.owner.query(api.facts.values, { site: 'restaurant' })).find((f) => f.name === 'contact.price')!
    expect((await fact()).next).toMatchObject({ from: '2026-10-09' })
    const [change] = await s.dated(contact)
    await s.t.run((ctx) => ctx.db.patch(change!._id, { stopped: { at: DAY1, reason: { code: 'invalid', fields: ['price'] } }, job: undefined }))
    expect((await fact()).next).toBeUndefined()
  })
})
