// Retention (SPEC 12). Daily; one run handles at most 200 documents in all. A run that uses up
// its budget schedules the next run at once, so the rest follows in batches.
import { addDays, deletesExpired, todayIn, visibleUntil, type Schema } from '@lupinum/ginko/internal'
import { internal } from './_generated/api'
import { internalMutation } from './_generated/server'
import { windowOf } from './bundle'
import { SYSTEM } from './lib/access'
import { deletePrevious, purgeUpload } from './lib/library'
import { msg, recorded } from './lib/history'
import { countersOf, DELETED_KEPT, purgeEntry, softRemove, writeCounters } from './lib/lifecycle'

export const BATCH = 200
const DAY = 24 * 60 * 60 * 1000
const OPS_KEPT = 30 * DAY
const CHANGES_KEPT = 365 * DAY
/** Trash and files before a replace (SPEC 12). */
const TRASH_KEPT = 30 * DAY
const PREVIOUS_KEPT = 30 * DAY
/** The outbox holds sign-in codes in plain text (local and `.test` addresses): a day is enough to read them. */
const OUTBOX_KEPT = DAY
/** Rate windows are only needed for the current minute; a day is kept for inspection. */
const WINDOWS_KEPT_MINUTES = 24 * 60

export const daily = internalMutation({
  args: {},
  handler: async (ctx): Promise<null> => {
    const now = Date.now()
    let left = BATCH

    const ops = await ctx.db.query('ops').withIndex('by_at', (q) => q.lt('at', now - OPS_KEPT)).take(left)
    for (const op of ops) await ctx.db.delete(op._id)
    left -= ops.length

    const changes = await ctx.db.query('changes').withIndex('by_at', (q) => q.lt('at', now - CHANGES_KEPT)).take(left)
    for (const change of changes) {
      const refs = await ctx.db.query('fileRefs').withIndex('by_holder', (q) => q.eq('holder', 'change').eq('holderId', change._id)).collect()
      for (const ref of refs) await ctx.db.delete(ref._id)
      await ctx.db.delete(change._id)
    }
    left -= changes.length

    // Decided proposals and releases go with the changes they led to (SPEC 17). An undecided or scheduled one stays.
    const decided = await ctx.db.query('proposals').withIndex('by_decided', (q) => q.gt('decidedAt', 0).lt('decidedAt', now - CHANGES_KEPT)).take(left)
    for (const row of decided) if (row.status !== 'scheduled') await ctx.db.delete(row._id)
    left -= decided.length
    const releases = await ctx.db.query('releases').withIndex('by_decided', (q) => q.gt('decidedAt', 0).lt('decidedAt', now - CHANGES_KEPT)).take(left)
    for (const row of releases) if (row.status !== 'scheduled') await ctx.db.delete(row._id)
    left -= releases.length

    // Replaced files: the storage of an earlier version goes 30 days after the replace. The few rows with `previous` are all looked at.
    for (const row of await ctx.db.query('uploads').withIndex('by_previous', (q) => q.eq('hasPrevious', true)).take(BATCH * 3)) {
      if (left === 0) break
      const old = (row.previous ?? []).filter((p) => p.replacedAt < now - PREVIOUS_KEPT)
      if (!old.length) continue
      for (const p of old) await deletePrevious(ctx, p)
      const rest = (row.previous ?? []).filter((p) => p.replacedAt >= now - PREVIOUS_KEPT)
      await ctx.db.patch(row._id, { previous: rest.length ? rest : undefined, hasPrevious: rest.length ? true : undefined })
      left--
    }

    const windows = await ctx.db.query('rateWindows').withIndex('by_window', (q) => q.lt('window', windowOf(now) - WINDOWS_KEPT_MINUTES)).take(left)
    for (const window of windows) await ctx.db.delete(window._id)
    left -= windows.length

    const mails = await ctx.db.query('outbox').withIndex('by_at', (q) => q.lt('at', now - OUTBOX_KEPT)).take(left)
    for (const mail of mails) await ctx.db.delete(mail._id)
    left -= mails.length

    for (const site of await ctx.db.query('sites').collect()) {
      if (left === 0) break
      const schema = site.schema as Schema
      const today = todayIn(schema.timeZone, new Date(now))
      // An entry is expired when it has been invisible for 30 days: its last visible day is before this date.
      const expiredSince = addDays(today, -30)
      // The site's counters change in this loop; one patch at the end writes them.
      const state = countersOf(site)
      let touched = false

      for (const [key, brick] of Object.entries(schema.bricks)) {
        if (left === 0) break
        if (deletesExpired(brick)) {
          const rows = await ctx.db.query('entries').withIndex('by_site_brick_order', (q) => q.eq('site', site._id).eq('brick', key)).collect()
          // Drafts are left alone: nobody has published them yet (SPEC 15).
          const expired = rows.filter((row) => {
            const until = visibleUntil(brick, row.data)
            return !row.deletedAt && row.state !== 'draft' && until !== undefined && until < expiredSince
          })
          for (const row of expired.slice(0, left)) {
            await softRemove(ctx, state, row, `retention:${row._id}:${row.lifeRev + 1}`, SYSTEM, recorded(msg('history.expiredAutoRemoved')), now)
            left--
            touched = true
          }
        }

        // Live entries have no deletedAt, and in the index `undefined` sorts before every number:
        // without the lower bound this range would hard-delete every live entry.
        const deleted = await ctx.db.query('entries').withIndex('by_site_brick_deleted', (q) => q.eq('site', site._id).eq('brick', key).gt('deletedAt', 0).lt('deletedAt', now - DELETED_KEPT)).take(left)
        for (const row of deleted) await purgeEntry(ctx, state, row)
        if (deleted.length) touched = true
        left -= deleted.length
      }

      // Trash: 30 days, then the file goes for good, but only when nothing refers to it any more
      // (an entry or a change within its year). Files that are still referred to stay and are looked at again tomorrow.
      if (left > 0) {
        const trashed = await ctx.db.query('uploads').withIndex('by_site_trashed', (q) => q.eq('site', site._id).gt('trashedAt', 0).lt('trashedAt', now - TRASH_KEPT)).take(BATCH * 3)
        for (const row of trashed) {
          if (left === 0) break
          if (await ctx.db.query('fileRefs').withIndex('by_file', (q) => q.eq('file', row._id)).first()) continue
          await purgeUpload(ctx, row)
          left--
        }
      }

      if (touched) await writeCounters(ctx, site._id, state)
    }

    if (left === 0) await ctx.scheduler.runAfter(0, internal.retention.daily, {})
    return null
  },
})
