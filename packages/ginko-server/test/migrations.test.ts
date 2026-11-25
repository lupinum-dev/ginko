// The data migrations that run by themselves after a deploy (convex/lib/migrations.ts): `migrations:runPending` starts
// what is pending, the steps run one after another, and a stopped one starts again from where it stopped.
import { checkSchema, type Schema } from '@lupinum/ginko/internal'
import { statusRules } from '@lupinum/ginko/patterns'
import { convexTest } from 'convex-test'
import { describe, expect, it, vi } from 'vitest'
import { api, internal } from '../convex/_generated/api'
import type { Id } from '../convex/_generated/dataModel'
import { MIGRATIONS } from '../convex/lib/migrations'
import schema from '../convex/schema'
import { opId, people, setup } from './setup'

type Backend = Awaited<ReturnType<typeof setup>>['t']

const modules = import.meta.glob(['../convex/**/*.*s', '!../convex/**/*.test.ts', '!../convex/betterAuth/**'])

const runs = (t: Backend) => t.run((ctx) => ctx.db.query('serverMigrations').collect())
const jobs = (t: Backend, name?: string) => t.run(async (ctx) => (await ctx.db.system.query('_scheduled_functions').collect())
  .filter((job) => name === undefined || job.name === name))
const pending = async (t: Backend, name: string) => (await jobs(t, name)).filter((job) => job.state.kind === 'pending')

/** One scheduled step and nothing after it (the clock stays before later timers such as sign-in expiry). */
async function oneStep(t: Backend) {
  vi.advanceTimersByTime(1)
  await t.finishInProgressScheduledFunctions()
}

describe('migrations.runPending', () => {
  // Wrong behaviour caught: after a deploy a migration never starts, the chain stops after the first page or the first
  // migration, or a deployment with old rows keeps them (budget counters off, `orderRevs` left on the site row).
  it('runs every listed migration once, in order, on a deployment with old data', async () => {
    vi.useFakeTimers()
    const s = await setup()
    const entry = s.entries.legal!
    await s.t.run(async (ctx) => {
      await ctx.db.patch(entry, { trees: '{}', bytes: 99_999, treeBytes: undefined, contentAt: undefined })
      await ctx.db.patch(s.site, { bytes: 1, trashBytes: undefined, treeBytes: undefined, orderRevs: { menu: 3 } })
    })
    expect(await s.t.mutation(internal.migrations.runPending, {})).toBe(`Migrations: started ${MIGRATIONS[0]!.name} (6 pending). Progress: npx convex run ops:status`)
    await s.t.finishAllScheduledFunctions(vi.runAllTimers)

    expect((await runs(s.t)).map((r) => [r.name, r.state])).toEqual(MIGRATIONS.map((m) => [m.name, 'done']))
    const site = (await s.t.run((ctx) => ctx.db.get(s.site)))!
    expect(site.orderRevs).toBeUndefined()
    expect((await s.t.run((ctx) => ctx.db.get(entry)))!.trees).toBeUndefined()
    // The recount ran after the entry migration: the counters are the sums over the migrated entries.
    const status = await s.t.query(internal.entries.storageStatus, { cursor: null })
    expect(status.sites).toMatchObject([{ site: 'restaurant', legacyRows: 0, countersMatch: true }])
    expect((await s.t.query(internal.ops.status, {}))!.migrations).toEqual({ done: 6, pending: [], running: null, stopped: null, skipped: [] })
  })

  // Wrong behaviour caught: every deploy runs the finished migrations again.
  it('starts nothing once all are done', async () => {
    vi.useFakeTimers()
    const s = await setup()
    await s.t.mutation(internal.migrations.runPending, {})
    await s.t.finishAllScheduledFunctions(vi.runAllTimers)
    const before = (await jobs(s.t)).length
    expect(await s.t.mutation(internal.migrations.runPending, {})).toBe('Migrations: all 6 done.')
    expect(await jobs(s.t)).toHaveLength(before)
  })

  // Wrong behaviour caught: two deploys in quick succession start the same migration twice.
  it('leaves a running migration alone', async () => {
    vi.useFakeTimers()
    const s = await setup()
    await s.t.mutation(internal.migrations.runPending, {})
    expect(await s.t.mutation(internal.migrations.runPending, {})).toBe(`Migrations: ${MIGRATIONS[0]!.name} still running (page 1).`)
    expect(await pending(s.t, 'entries:migrateStorage')).toHaveLength(1)
    expect(await runs(s.t)).toHaveLength(1)
  })

  // Wrong behaviour caught: a fresh install starts the chain over empty tables or reports work that does not exist.
  it('records every migration as done on a fresh deployment without running any', async () => {
    const t = convexTest(schema, modules)
    expect(await t.mutation(internal.migrations.runPending, {})).toBe('Migrations: fresh deployment, 6 recorded as done.')
    expect((await runs(t)).map((r) => [r.name, r.state, r.baseline])).toEqual(MIGRATIONS.map((m) => [m.name, 'done', true]))
    expect(await jobs(t)).toEqual([])
  })

  // Wrong behaviour caught: a stopped migration goes unnoticed (nothing in ops:status), never starts again, or starts
  // again from the first page instead of where it stopped.
  it('shows a stopped migration and starts it again from its saved cursor', async () => {
    vi.useFakeTimers()
    const s = await setup()
    await s.t.mutation(internal.migrations.runPending, {})
    await oneStep(s.t) // the first page of the entries (the fixture has more than one page)
    const [row] = await runs(s.t)
    expect(row).toMatchObject({ pages: 1, state: 'running' })
    // Canceled in the dashboard; a page that throws ends the same way, as `failed`.
    await s.t.run((ctx) => ctx.scheduler.cancel(row!.job!))
    expect((await s.t.query(internal.ops.status, {}))!.migrations).toMatchObject({
      running: null, stopped: { name: MIGRATIONS[0]!.name, pages: 1, error: 'canceled' },
    })

    expect(await s.t.mutation(internal.migrations.runPending, {})).toBe(`Migrations: ${MIGRATIONS[0]!.name} stopped at page 2: canceled. Restarted from there.`)
    const [restarted] = await pending(s.t, 'entries:migrateStorage')
    expect(restarted!.args[0]).toEqual({ run: row!._id, cursor: row!.cursor })
    expect(row!.cursor).not.toBeNull()
    expect((await runs(s.t))[0]).toMatchObject({ attempts: 2 })
    await s.t.finishAllScheduledFunctions(vi.runAllTimers)
    expect((await s.t.query(internal.ops.status, {}))!.migrations).toMatchObject({ done: 6, stopped: null })
  })
})

describe('2026-11-25-dated-changes (D130)', () => {
  /** The earlier migrations as done, so runPending starts this one alone; then its pages, one step at a time. */
  async function runThisOne(s: Awaited<ReturnType<typeof setup>>) {
    await s.t.run(async (ctx) => {
      for (const m of MIGRATIONS.slice(0, -1)) await ctx.db.insert('serverMigrations', { name: m.name, state: 'done', cursor: null, pages: 0, attempts: 0, startedAt: 0, finishedAt: 0 })
    })
    expect(await s.t.mutation(internal.migrations.runPending, {})).toMatch('started 2026-11-25-dated-changes')
    for (let page = 0; page < 5 && (await runs(s.t)).some((r) => r.state === 'running'); page++) await oneStep(s.t)
    expect((await runs(s.t)).every((r) => r.state === 'done')).toBe(true)
  }

  // Wrong behaviour caught: after the upgrade, a time on unpublished changes, a request approved for a time or a
  // `planned` price is lost or runs through code that is gone: the change never goes online, a cancelled job still
  // fires, or the stored schema keeps `planned` and every release of the site is refused.
  it('turns the older plans into dated changes, open requests and a schema with timeline', async () => {
    vi.useFakeTimers()
    const s = await setup()
    const { schnitzel, saibling, risotto, contact } = { schnitzel: s.entries['menu-schnitzel']!, saibling: s.entries['menu-saibling']!, risotto: s.entries['menu-risotto']!, contact: s.entries.contact! }
    const later = Date.parse('2026-10-20T08:00:00Z')
    const proposal = (await s.as.cook.mutation(api.entries.save, { publish: true, site: 'restaurant', opId: opId(), task: 'lunch.lunchWeek', entry: s.entries.lunch!, baseRev: 1, fields: { note: { de: 'Neu' } } }) as { proposal: Id<'proposals'> }).proposal
    const before = (await s.t.run((ctx) => ctx.db.get(s.site)))!
    await s.t.run(async (ctx) => {
      const site = (await ctx.db.get(s.site))!
      const stored = structuredClone(site.schema) as { bricks: Record<string, { fields: Record<string, unknown>; tasks: { id: string; fields?: string[]; when?: unknown }[]; timeline?: unknown; planned?: unknown }> }
      const menu = stored.bricks.menu!
      menu.fields.nextPrice = { type: 'money', label: 'Geplanter Preis', optional: true, pos: 7 }
      menu.fields.priceFrom = { type: 'date', label: 'Gilt ab', optional: true, pos: 8 }
      menu.planned = { field: 'price', next: 'nextPrice', from: 'priceFrom' }
      delete menu.timeline
      menu.tasks = menu.tasks.map((task) => (task.id === 'price' ? { id: task.id, label: 'Preis ändern', kind: 'edit', pick: true, fields: ['price', 'nextPrice', 'priceFrom'] } : task.id === 'edit' ? { ...task, fields: [...task.fields!, 'nextPrice', 'priceFrom'] } : task)) as typeof menu.tasks
      await ctx.db.patch(s.site, { schema: stored })
      // The stored model is in the older format: the new check refuses it, and the migration must not need it.
      expect(checkSchema(stored as unknown as Schema, statusRules)).not.toEqual([])
      const plan = async (entry: Id<'entries'>, next: number, from: string) => {
        const row = (await ctx.db.get(entry))!
        await ctx.db.patch(entry, { data: { ...(row.data as object), nextPrice: { amount: next }, priceFrom: from } })
      }
      await plan(schnitzel, 2290, '2026-10-18')
      await plan(saibling, 1590, '2026-10-01')
      const timed = async (entry: Id<'entries'>, brick: string, fields: Record<string, unknown>, at: number) => {
        const id = await ctx.db.insert('pendingChanges', { site: s.site, entry, brick, fields, prints: {}, revs: Object.fromEntries(Object.keys(fields).map((k) => [k, 1])), by: people.owner, since: 0, at: 0, publishAt: at })
        await ctx.db.patch(id, { publishJob: await ctx.scheduler.runAt(at, internal.entries.publishDue, { entry, at }) })
      }
      await timed(risotto, 'menu', { price: { amount: 1500 } }, later)
      await timed(contact, 'contact', { city: 'Graz' }, Date.now() - 60_000)
      await ctx.db.patch(proposal, { status: 'scheduled', at: later, decidedBy: people.owner, decidedAt: Date.now(), job: await ctx.scheduler.runAt(later, internal.entries.publishDue, { entry: s.entries.lunch!, at: later }) })
    })

    await runThisOne(s)

    const after = await s.t.run(async (ctx) => ({
      site: (await ctx.db.get(s.site))!,
      dated: await ctx.db.query('datedChanges').collect(),
      pending: await ctx.db.query('pendingChanges').collect(),
      proposal: (await ctx.db.get(proposal))!,
      jobs: (await ctx.db.system.query('_scheduled_functions').collect()).filter((j) => j.name === 'entries:publishDue' && j.state.kind === 'pending'),
      entries: Object.fromEntries(await Promise.all([schnitzel, saibling].map(async (id) => [id, (await ctx.db.get(id))!.data]))),
    }))
    // The risotto's time is a dated change of 20 October by the person who saved it; the contact's had passed: it is
    // online now, in the planner's name. No old job is left.
    expect(after.dated.map((d) => [d.entry, d.from, d.fields, d.by ?? null]).sort()).toEqual([
      [risotto, '2026-10-20', { price: { amount: 1500 } }, people.owner],
      [schnitzel, '2026-10-18', { price: { amount: 2290 } }, null],
    ].sort())
    expect(after.pending).toEqual([])
    expect(await s.t.run(async (ctx) => (await ctx.db.get(contact))!.data)).toMatchObject({ city: 'Graz' })
    expect((await s.t.run((ctx) => ctx.db.query('changes').withIndex('by_entry', (q) => q.eq('entry', contact)).collect())).at(-1)).toMatchObject({ kind: 'save', msg: { key: 'history.publishedChanges' }, plannedBy: people.owner })
    expect(after.jobs).toEqual([])
    // The request is open again for a new decision.
    expect([after.proposal.status, after.proposal.at, after.proposal.job, after.proposal.decidedBy]).toEqual(['open', undefined, undefined, undefined])
    // The planned price whose day had come is in the field; the plan fields are gone from the data.
    expect(after.entries[saibling]).toMatchObject({ price: { amount: 1590 } })
    expect(after.entries[schnitzel]).toMatchObject({ price: { amount: 2190 } })
    for (const data of Object.values(after.entries)) expect(Object.keys(data as object)).not.toEqual(expect.arrayContaining(['nextPrice']))
    // The stored schema: no plan, the coming price public, the price task asks for the day; the edit task cannot.
    const menu = (after.site.schema as { bricks: Record<string, any> }).bricks.menu
    expect([menu.planned, menu.fields.nextPrice, menu.fields.priceFrom, menu.timeline]).toEqual([undefined, undefined, undefined, { public: ['price'] }])
    expect(menu.tasks.find((t: { id: string }) => t.id === 'price')).toEqual({ id: 'price', label: 'Preis ändern', kind: 'edit', pick: true, fields: ['price'], when: { from: 'ask' } })
    expect(menu.tasks.find((t: { id: string }) => t.id === 'edit').when).toBeUndefined()
    expect(checkSchema(after.site.schema as Schema, statusRules)).toEqual([])
    // contentRev rises with the converted model, the risotto's change of a public field and the contact going online.
    expect([after.site.schemaRev, after.site.contentRev]).toEqual([before.schemaRev + 1, before.contentRev + 3])
    // The coming price is on the website's bundle the way a new dated change is.
    const bundle = await (await s.t.fetch('/bundle/restaurant?format=3&locale=de')).json() as { bricks: { menu: { items: { id: string; upcoming?: unknown }[] } } }
    expect(bundle.bricks.menu.items.find((i) => i.id === schnitzel)?.upcoming).toEqual([{ from: '2026-10-18', data: { price: { amount: 2290, currency: 'EUR' } } }])
  })

  /** The menu's stored model as before D129: a `planned` price with its two plan fields. */
  async function withPlanned(s: Awaited<ReturnType<typeof setup>>, site = s.site) {
    await s.t.run(async (ctx) => {
      const stored = structuredClone((await ctx.db.get(site))!.schema) as { bricks: Record<string, { fields: Record<string, unknown>; planned?: unknown; timeline?: unknown }> }
      const menu = stored.bricks.menu!
      menu.fields.nextPrice = { type: 'money', label: 'Geplanter Preis', optional: true, pos: 7 }
      menu.fields.priceFrom = { type: 'date', label: 'Gilt ab', optional: true, pos: 8 }
      menu.planned = { field: 'price', next: 'nextPrice', from: 'priceFrom' }
      delete menu.timeline
      await ctx.db.patch(site, { schema: stored as never })
    })
  }
  const timedRow = (s: Awaited<ReturnType<typeof setup>>, entry: Id<'entries'>, fields: Record<string, unknown>, publishAt: number) =>
    s.t.run((ctx) => ctx.db.insert('pendingChanges', { site: s.site, entry, brick: 'menu', fields, prints: {}, revs: Object.fromEntries(Object.keys(fields).map((k) => [k, 1])), by: people.owner, since: 0, at: 0, publishAt }))
  const datedRows = (s: Awaited<ReturnType<typeof setup>>) => s.t.run(async (ctx) => (await ctx.db.query('datedChanges').collect()).map((d) => [d.entry, d.from, d.fields]))

  // Wrong behaviour caught: the timed changes were converted with the old model, so a plan field in them became a
  // dated change of a field the converted model no longer has (it stops on its day, and no form shows it).
  it('converts the planned rule first, then a timed change with the converted model', async () => {
    vi.useFakeTimers()
    const s = await setup()
    const risotto = s.entries['menu-risotto']!
    await withPlanned(s)
    await timedRow(s, risotto, { price: { amount: 1500 }, nextPrice: { amount: 1600 } }, Date.parse('2026-10-20T08:00:00Z'))
    await runThisOne(s)
    expect(await datedRows(s)).toEqual([[risotto, '2026-10-20', { price: { amount: 1500 } }]])
    expect(await s.t.run((ctx) => ctx.db.query('pendingChanges').collect())).toEqual([])
  })

  // A3. Wrong behaviour caught: a time whose day had come (also one that passed between the deploy and the step) left
  // the changes unpublished, though the person had planned them for then; or the day was read in UTC, not the site's.
  it.each([
    ['later today', '2026-10-08T18:00:00Z', 'online'],
    ['an hour ago', '2026-10-08T09:00:00Z', 'online'],
    ['20 October 01:30 in Vienna, still 19 October in UTC', '2026-10-19T23:30:00Z', '2026-10-20'],
  ])('a time %s', async (_, at, expected) => {
    vi.useFakeTimers()
    vi.setSystemTime(Date.parse('2026-10-08T10:00:00Z'))
    const s = await setup()
    const risotto = s.entries['menu-risotto']!
    await timedRow(s, risotto, { price: { amount: 1500 } }, Date.parse(at))
    await runThisOne(s)
    const price = (await s.t.run((ctx) => ctx.db.get(risotto)))!.data as { price: unknown }
    if (expected === 'online') {
      expect([price.price, await datedRows(s)]).toEqual([{ amount: 1500 }, []])
    } else {
      expect(await datedRows(s)).toEqual([[risotto, expected, { price: { amount: 1500 } }]])
    }
    expect(await s.t.run((ctx) => ctx.db.query('pendingChanges').collect())).toEqual([])
  })

  // A3. Wrong behaviour caught: a change whose day has come goes online although the check refuses it.
  it('keeps a due change the check refuses unpublished, with a history line', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(Date.parse('2026-10-08T10:00:00Z'))
    const s = await setup()
    const risotto = s.entries['menu-risotto']!
    await timedRow(s, risotto, { price: { amount: -5 } }, Date.parse('2026-10-08T09:00:00Z'))
    await runThisOne(s)
    expect(((await s.t.run((ctx) => ctx.db.get(risotto)))!.data as { price: unknown }).price).not.toEqual({ amount: -5 })
    expect((await s.t.run((ctx) => ctx.db.query('pendingChanges').collect())).map((p) => [p.fields, p.publishAt ?? null])).toEqual([[{ price: { amount: -5 } }, null]])
    expect((await s.t.run((ctx) => ctx.db.query('changes').withIndex('by_entry', (q) => q.eq('entry', risotto)).collect())).at(-1)).toMatchObject({ kind: 'unschedule' })
  })

  // G1. Wrong behaviour caught: a planned price and another change of the same day became two rows of one day, and every
  // later save into that day was refused ("two changes have the day").
  it.each([
    ['a timed unpublished change', async (s: Awaited<ReturnType<typeof setup>>, entry: Id<'entries'>) => {
      await timedRow(s, entry, { veg: 'vegan' }, Date.parse('2026-10-20T08:00:00Z'))
    }],
    ['a dated change saved since the deploy', async (s: Awaited<ReturnType<typeof setup>>, entry: Id<'entries'>) => {
      await s.as.owner.mutation(api.entries.save, { site: 'restaurant', opId: opId(), entry, baseRev: 1, fields: { veg: 'vegan' }, from: '2026-10-20' })
    }],
  ])('joins a planned value and %s of the same day into one row', async (_, other) => {
    vi.useFakeTimers()
    vi.setSystemTime(Date.parse('2026-10-08T10:00:00Z'))
    const s = await setup()
    const schnitzel = s.entries['menu-schnitzel']!
    await withPlanned(s)
    await s.t.run(async (ctx) => {
      const row = (await ctx.db.get(schnitzel))!
      await ctx.db.patch(schnitzel, { data: { ...(row.data as object), nextPrice: { amount: 2290 }, priceFrom: '2026-10-20' } })
    })
    await other(s, schnitzel)
    await runThisOne(s)
    expect(await datedRows(s)).toEqual([[schnitzel, '2026-10-20', { price: { amount: 2290 }, veg: 'vegan' }]])
  })

  // Wrong behaviour caught: the migration cancels a job that already ran or failed, which rewrites its record in
  // `_scheduled_functions` (the only place a failed run is remembered) as cancelled.
  it('cancels only a job that still waits', async () => {
    vi.useFakeTimers()
    const s = await setup()
    const at = Date.parse('2026-10-20T08:00:00Z')
    const job = await s.t.run(async (ctx) => {
      // An old run of the time that already ran (it finds another time on the row and does nothing).
      const id = await ctx.scheduler.runAfter(0, internal.entries.publishDue, { entry: s.entries['menu-risotto']!, at: 0 })
      await ctx.db.insert('pendingChanges', { site: s.site, entry: s.entries['menu-risotto']!, brick: 'menu', fields: { price: { amount: 1500 } }, prints: {}, revs: { price: 1 }, by: people.owner, since: 0, at: 0, publishAt: at, publishJob: id })
      return id
    })
    await oneStep(s.t)
    const ran = (await s.t.run((ctx) => ctx.db.system.get(job)))!.state.kind
    expect(ran).not.toBe('pending')
    await runThisOne(s)
    expect((await s.t.run((ctx) => ctx.db.system.get(job)))!.state.kind).toBe(ran)
  })

  // Wrong behaviour caught: the migration touches a site that has none of the older plans (a new schemaRev makes every
  // release look like a model change; a new contentRev empties the website's cache).
  it('leaves a site without older plans as it is', async () => {
    vi.useFakeTimers()
    const s = await setup()
    const read = () => s.t.run(async (ctx) => ({ site: (await ctx.db.get(s.site))!, changes: (await ctx.db.query('changes').collect()).length, dated: (await ctx.db.query('datedChanges').collect()).length }))
    const before = await read()
    await runThisOne(s)
    const after = await read()
    expect([after.site.schema, after.site.schemaRev, after.site.contentRev, after.changes, after.dated]).toEqual([before.site.schema, before.site.schemaRev, before.site.contentRev, before.changes, 0])
  })

  // A1. Wrong behaviour caught: one timed change the migration cannot convert (here of a brick the stored model no
  // longer has, so even its title cannot be read) stops the whole site.
  it('keeps a timed change it cannot convert unpublished and converts the rest of the site', async () => {
    vi.useFakeTimers()
    const s = await setup()
    const [risotto, schnitzel] = [s.entries['menu-risotto']!, s.entries['menu-schnitzel']!]
    await timedRow(s, risotto, { price: { amount: 1500 } }, Date.parse('2026-10-20T08:00:00Z'))
    await s.t.run((ctx) => ctx.db.insert('pendingChanges', { site: s.site, entry: s.entries.contact!, brick: 'gone', fields: { city: 'Graz' }, prints: {}, revs: { city: 1 }, by: people.owner, since: 0, at: 0, publishAt: Date.parse('2026-10-20T08:00:00Z') }))
    await s.t.run((ctx) => ctx.db.patch(s.entries.contact!, { brick: 'gone' }))
    await withPlanned(s)
    await s.t.run(async (ctx) => {
      const row = (await ctx.db.get(schnitzel))!
      await ctx.db.patch(schnitzel, { data: { ...(row.data as object), nextPrice: { amount: 2290 }, priceFrom: '2026-10-25' } })
    })
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    await runThisOne(s)
    expect(log.mock.calls.map((c) => String(c[0]).replace(/changes \S+ stay/, 'changes … stay'))).toEqual(['Migration 2026-11-25-dated-changes: unpublished changes … stay without a time (TypeError).'])
    log.mockRestore()
    expect((await s.t.query(internal.ops.status, {}))!.migrations.skipped).toEqual([])
    expect((await datedRows(s)).sort()).toEqual([[risotto, '2026-10-20', { price: { amount: 1500 } }], [schnitzel, '2026-10-25', { price: { amount: 2290 } }]].sort())
    const kept = await s.t.run(async (ctx) => ({
      held: (await ctx.db.query('pendingChanges').collect()).map((p) => [p.entry, p.publishAt ?? null]),
      line: (await ctx.db.query('changes').withIndex('by_entry', (q) => q.eq('entry', s.entries.contact!)).collect()).at(-1)!,
    }))
    expect(kept.held).toEqual([[s.entries.contact!, null]])
    expect(kept.line).toMatchObject({ kind: 'unschedule', msg: { key: 'history.changesUnscheduled', params: { title: 'gone' } } })
  })

  // Wrong behaviour caught: one site the migration cannot convert stops it for every other site, or leaves that site
  // half converted, and nobody learns which site it was.
  it('reports a site it cannot convert by name and converts the others', async () => {
    vi.useFakeTimers()
    const s = await setup()
    const second = await s.t.run(async (ctx) => {
      const { _id, _creationTime, ...site } = (await ctx.db.get(s.site))!
      const stored = structuredClone(site.schema) as { bricks: Record<string, { fields: Record<string, unknown>; planned?: unknown; timeline?: unknown }> }
      stored.bricks.menu!.fields.nextPrice = { type: 'money', label: 'Geplanter Preis', optional: true, pos: 7 }
      stored.bricks.menu!.fields.priceFrom = { type: 'date', label: 'Gilt ab', optional: true, pos: 8 }
      stored.bricks.menu!.planned = { field: 'price', next: 'nextPrice', from: 'priceFrom' }
      return ctx.db.insert('sites', { ...site, slug: 'zweite', schema: stored })
    })
    // The restaurant has a timed unpublished change, and a planned rule on a brick whose stored fields cannot be read.
    await timedRow(s, s.entries['menu-risotto']!, { price: { amount: 1500 } }, Date.parse('2026-10-20T08:00:00Z'))
    await withPlanned(s)
    await s.t.run(async (ctx) => {
      const site = (await ctx.db.get(s.site))!
      const stored = structuredClone(site.schema) as { bricks: Record<string, { fields: unknown }> }
      stored.bricks.menu!.fields = null
      await ctx.db.patch(s.site, { schema: stored as unknown as typeof site.schema })
    })
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    await runThisOne(s)
    expect(log.mock.calls).toEqual([['Migration 2026-11-25-dated-changes: site restaurant not converted (TypeError); the other sites go on.']])
    log.mockRestore()
    expect((await s.t.query(internal.ops.status, {}))!.migrations.skipped).toEqual([{ migration: '2026-11-25-dated-changes', site: 'restaurant' }])
    const after = await s.t.run(async (ctx) => ({ restaurant: (await ctx.db.query('pendingChanges').collect())[0]!, second: (await ctx.db.get(second))! }))
    // Nothing of the restaurant is half written: its change keeps its time.
    expect(after.restaurant.publishAt).toBe(Date.parse('2026-10-20T08:00:00Z'))
    expect((after.second.schema as { bricks: Record<string, { planned?: unknown; timeline?: unknown }> }).bricks.menu).toMatchObject({ timeline: { public: ['price'] } })
    expect((after.second.schema as { bricks: Record<string, { planned?: unknown }> }).bricks.menu!.planned).toBeUndefined()
  })
})
