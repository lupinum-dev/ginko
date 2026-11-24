// The data migrations that run by themselves after a deploy (convex/lib/migrations.ts): `migrations:runPending` starts
// what is pending, the steps run one after another, and a stopped one starts again from where it stopped.
import { convexTest } from 'convex-test'
import { describe, expect, it, vi } from 'vitest'
import { internal } from '../convex/_generated/api'
import { MIGRATIONS } from '../convex/lib/migrations'
import schema from '../convex/schema'
import { setup } from './setup'

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
    expect(await s.t.mutation(internal.migrations.runPending, {})).toBe(`Migrations: started ${MIGRATIONS[0]!.name} (5 pending). Progress: npx convex run ops:status`)
    await s.t.finishAllScheduledFunctions(vi.runAllTimers)

    expect((await runs(s.t)).map((r) => [r.name, r.state])).toEqual(MIGRATIONS.map((m) => [m.name, 'done']))
    const site = (await s.t.run((ctx) => ctx.db.get(s.site)))!
    expect(site.orderRevs).toBeUndefined()
    expect((await s.t.run((ctx) => ctx.db.get(entry)))!.trees).toBeUndefined()
    // The recount ran after the entry migration: the counters are the sums over the migrated entries.
    const status = await s.t.query(internal.entries.storageStatus, { cursor: null })
    expect(status.sites).toMatchObject([{ site: 'restaurant', legacyRows: 0, countersMatch: true }])
    expect((await s.t.query(internal.ops.status, {}))!.migrations).toEqual({ done: 5, pending: [], running: null, stopped: null })
  })

  // Wrong behaviour caught: every deploy runs the finished migrations again.
  it('starts nothing once all are done', async () => {
    vi.useFakeTimers()
    const s = await setup()
    await s.t.mutation(internal.migrations.runPending, {})
    await s.t.finishAllScheduledFunctions(vi.runAllTimers)
    const before = (await jobs(s.t)).length
    expect(await s.t.mutation(internal.migrations.runPending, {})).toBe('Migrations: all 5 done.')
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
    expect(await t.mutation(internal.migrations.runPending, {})).toBe('Migrations: fresh deployment, 5 recorded as done.')
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
    expect((await s.t.query(internal.ops.status, {}))!.migrations).toMatchObject({ done: 5, stopped: null })
  })
})
