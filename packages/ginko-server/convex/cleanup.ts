// Daily clean-up of stale personal data that no feature reads any more (GDPR storage limitation):
// expired Better Auth sessions and verification rows (sign-in codes), and invitations that expired more than 30 days ago.
// The outbox (mails in plain text) is cleaned by `retention.daily` after a day, so it is not repeated here.
import { internal, components } from './_generated/api'
import { internalMutation, type MutationCtx } from './_generated/server'

const DAY = 24 * 60 * 60 * 1000
export const INVITES_KEPT = 30 * DAY
/** Rows per kind and run; a full batch schedules the next run at once. */
const BATCH = 100

/** Deletes up to `BATCH` Better Auth rows of `model` that expired before `now`. Returns whether more may be left. */
async function dropExpired(ctx: MutationCtx, model: 'session' | 'verification', now: number): Promise<boolean> {
  const page = await ctx.runQuery(components.betterAuth.adapter.findMany, {
    model, where: [{ field: 'expiresAt', operator: 'lt', value: now }], select: ['id'], paginationOpts: { cursor: null, numItems: BATCH },
  })
  const ids = page.page.map((row) => String(row.id))
  // Deleted by id: `deleteMany` refuses to touch more than 128 rows at once, and by user id it only invalidates sessions.
  if (ids.length) await ctx.runMutation(components.betterAuth.adapter.deleteMany, { model, where: [{ field: 'id', operator: 'in', value: ids }] })
  return ids.length === BATCH
}

export const daily = internalMutation({
  args: {},
  handler: async (ctx): Promise<null> => {
    const now = Date.now()
    const more = [
      await dropExpired(ctx, 'session', now),
      await dropExpired(ctx, 'verification', now),
    ]
    const invites = await ctx.db.query('invites').withIndex('by_expires', (q) => q.lt('expiresAt', now - INVITES_KEPT)).take(BATCH)
    for (const invite of invites) await ctx.db.delete(invite._id)
    more.push(invites.length === BATCH)
    if (more.some(Boolean)) await ctx.scheduler.runAfter(0, internal.cleanup.daily, {})
    return null
  },
})
