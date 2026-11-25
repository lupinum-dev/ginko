// One-time data migrations of the platform, run by themselves after a deploy (`migrations:runPending`, called by the
// build script right after `convex deploy`). The rules for writing one are in internals/migrations.md.
//
// A migration is a list entry below and a step function that does one page and then calls `advance`. Mutation steps
// call it in the same transaction, so a page's writes and the cursor of the next page are saved together or not at
// all: a restart repeats nothing and skips nothing. `advance` does all scheduling, one migration at a time, in list
// order. Whether a stopped run failed or was canceled is not stored: it is the state of its scheduled job in Convex's
// `_scheduled_functions` table (kept 7 days; a run whose job is gone counts as stopped too).
import type { FunctionReference } from 'convex/server'
import { ConvexError, v, type ObjectType } from 'convex/values'
import { internal } from '../_generated/api'
import type { Doc, Id } from '../_generated/dataModel'
import type { MutationCtx, QueryCtx } from '../_generated/server'

/** What every step receives: its run row and where the page starts (`null`: from the beginning). */
export const stepArgs = { run: v.id('serverMigrations'), cursor: v.union(v.string(), v.null()) }
export type StepArgs = ObjectType<typeof stepArgs>

interface Migration {
  /** Date-prefixed, never renamed or reused: the run row is found by it. A changed step is a new entry. */
  name: string
  step: FunctionReference<'mutation' | 'action', 'internal', StepArgs>
}

/**
 * Every migration, in the order they run. Append only. An entry stays until the next major version: self-hosters can
 * skip versions, so "it ran on every deployment" can never be known (internals/migrations.md).
 */
export const MIGRATIONS: readonly Migration[] = [
  { name: '2026-10-14-entry-storage', step: internal.entries.migrateStorage },
  { name: '2026-10-15-drop-order-revs', step: internal.sites.dropOrderRevs },
  { name: '2026-10-15-markdown-storage-urls', step: internal.migrations.markdownStorageUrls },
  // Once, after both entry migrations: each site's byte counters become the sums over its entries.
  { name: '2026-10-15-recount-storage', step: internal.entries.recountStorage },
  { name: '2026-10-12-image-variants', step: internal.images.variantsMigration },
  // Planned values of the older ways (a time on unpublished changes, a scheduled single request, `planned`) become
  // dated changes (D130).
  { name: '2026-11-25-dated-changes', step: internal.datedChanges.migrateOlderWays },
]

const known = new Set(MIGRATIONS.map((m) => m.name))

/** Every run row. The table holds one row per migration ever listed, so reading all of it stays small. */
const allRuns = (ctx: QueryCtx) => ctx.db.query('serverMigrations').collect()

/** Schedules the page at `cursor` of `row`'s migration and records the job. */
async function schedule(ctx: MutationCtx, row: Doc<'serverMigrations'>, cursor: string | null) {
  const migration = MIGRATIONS.find((m) => m.name === row.name)!
  const job = await ctx.scheduler.runAfter(0, migration.step, { run: row._id, cursor })
  await ctx.db.patch(row._id, { cursor, job })
}

/** Starts the first migration of the list that has not finished, or returns null when all have. */
export async function startNext(ctx: MutationCtx): Promise<{ name: string; pending: number } | null> {
  const rows = await allRuns(ctx)
  const pending = MIGRATIONS.filter((m) => !rows.some((r) => r.name === m.name && r.state === 'done'))
  const next = pending[0]
  if (!next) return null
  const id = await ctx.db.insert('serverMigrations', { name: next.name, state: 'running', cursor: null, pages: 0, attempts: 1, startedAt: Date.now() })
  await schedule(ctx, (await ctx.db.get(id))!, null)
  return { name: next.name, pending: pending.length }
}

/**
 * The end of a step's page: with `next`, schedule the next page; without, record the migration as done and start the
 * next one. A call for a run that is already done changes nothing.
 */
export async function advance(ctx: MutationCtx, run: Id<'serverMigrations'>, next: string | null): Promise<null> {
  const row = await ctx.db.get(run)
  if (!row || row.state === 'done') return null
  await ctx.db.patch(run, { pages: row.pages + 1 })
  if (next !== null) {
    await schedule(ctx, { ...row, pages: row.pages + 1 }, next)
    return null
  }
  await ctx.db.patch(run, { state: 'done', cursor: null, job: undefined, finishedAt: Date.now() })
  await startNext(ctx)
  return null
}

/** The running row of a known migration and what its job says: still going, or stopped (failed, canceled or gone). */
async function current(ctx: QueryCtx) {
  const row = (await allRuns(ctx)).find((r) => r.state === 'running' && known.has(r.name))
  if (!row) return null
  const job = row.job === undefined ? null : await ctx.db.system.get(row.job)
  const kind = job?.state.kind
  if (kind === 'pending' || kind === 'inProgress') return { row, stopped: null }
  const error = job?.state.kind === 'failed' ? job.state.error : kind === 'canceled' ? 'canceled' : 'reason no longer known'
  return { row, stopped: { error, at: job?.completedTime ?? null } }
}

/**
 * Starts what is pending after a deploy and returns one line for the build log. A fresh deployment (no run recorded,
 * no site) has nothing to migrate: every migration is recorded as done without running. A running migration is left
 * alone; a stopped one starts again from its saved cursor (once per call, so once per deploy: no retry loop).
 */
export async function runPending(ctx: MutationCtx): Promise<string> {
  const rows = await allRuns(ctx)
  if (rows.length === 0 && (await ctx.db.query('sites').first()) === null) {
    const now = Date.now()
    for (const m of MIGRATIONS) {
      await ctx.db.insert('serverMigrations', { name: m.name, state: 'done', cursor: null, pages: 0, attempts: 0, startedAt: now, finishedAt: now, baseline: true })
    }
    return `Migrations: fresh deployment, ${MIGRATIONS.length} recorded as done.`
  }
  const now = await current(ctx)
  if (now && !now.stopped) return `Migrations: ${now.row.name} still running (page ${now.row.pages + 1}).`
  if (now?.stopped) {
    await ctx.db.patch(now.row._id, { attempts: now.row.attempts + 1 })
    await schedule(ctx, now.row, now.row.cursor)
    return `Migrations: ${now.row.name} stopped at page ${now.row.pages + 1}: ${now.stopped.error}. Restarted from there.`
  }
  const started = await startNext(ctx)
  if (!started) return `Migrations: all ${MIGRATIONS.length} done.`
  return `Migrations: started ${started.name} (${started.pending} pending). Progress: npx convex run ops:status`
}

/** For `ops:status`: how many are done, which are pending, and the running or stopped one. */
export async function migrationStatus(ctx: QueryCtx) {
  const done = new Set((await allRuns(ctx)).filter((r) => r.state === 'done').map((r) => r.name))
  const now = await current(ctx)
  const page = (row: Doc<'serverMigrations'>) => ({ name: row.name, pages: row.pages, startedAt: row.startedAt })
  return {
    done: MIGRATIONS.filter((m) => done.has(m.name)).length,
    pending: MIGRATIONS.filter((m) => !done.has(m.name)).map((m) => m.name),
    running: now && !now.stopped ? page(now.row) : null,
    stopped: now?.stopped ? { ...page(now.row), error: now.stopped.error, at: now.stopped.at } : null,
    skipped: (await allRuns(ctx)).flatMap((r) => (r.skipped ?? []).map((s) => ({ migration: r.name, site: s.slug, id: s.site, kind: s.kind }))),
  }
}

/** What a site step throws when it cannot convert its site: the class or code of the error, for `eachSite`'s log line. */
export function notConverted(error: unknown): ConvexError<{ code: 'NOT_CONVERTED'; kind: string }> {
  const kind = error instanceof ConvexError ? String((error.data as { code?: unknown } | null)?.code) : error instanceof Error ? error.constructor.name : typeof error
  return new ConvexError({ code: 'NOT_CONVERTED', kind })
}

/**
 * Runs `convert` for one site of a step, a nested mutation (a transaction of its own): a site it cannot convert leaves
 * nothing half written, is logged and recorded on the run with its id, slug and error kind (`ops:status`), and the
 * step goes on with the other sites. The site step, run again by hand, calls `clearSkipped` when it succeeds. An error loses its class on the way out of a nested mutation, so the step throws `notConverted(error)`.
 */
export async function eachSite(ctx: MutationCtx, run: Id<'serverMigrations'>, site: Doc<'sites'>, convert: () => Promise<unknown>) {
  try {
    await convert()
  } catch (error) {
    const row = (await ctx.db.get(run))!
    const kind = error instanceof ConvexError ? String((error.data as { kind?: unknown } | null)?.kind) : 'unknown'
    // The class or code only: an error's message can hold a title or an address.
    console.error(`Migration ${row.name}: site ${site.slug} not converted (${kind}); the other sites go on.`)
    await ctx.db.patch(run, { skipped: [...(row.skipped ?? []).filter((s) => s.site !== site._id), { site: site._id, slug: site.slug, kind }] })
  }
}

/** Takes `site` off the skipped list of migration `name`: its site step ran again and succeeded. */
export async function clearSkipped(ctx: MutationCtx, name: string, site: Id<'sites'>) {
  for (const row of await allRuns(ctx)) {
    if (row.name !== name || !row.skipped?.some((s) => s.site === site)) continue
    await ctx.db.patch(row._id, { skipped: row.skipped.filter((s) => s.site !== site) })
  }
}
