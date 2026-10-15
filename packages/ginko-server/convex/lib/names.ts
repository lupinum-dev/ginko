// Who did something (history, approvals, files), as data: the Studio words it in the reader's language.
import type { Id } from '../_generated/dataModel'
import type { QueryCtx } from '../_generated/server'
import type { Actor } from './access'

/**
 * `self`: the reader themselves ("Du"), also for a save from their other window. A member comes with the name they
 * set (`account.setName`) and their email where the reader may see it: staff do not see the addresses of colleagues
 * (personal data), only their names. Otherwise what kind of person it was: `platform` is an admin of the platform who
 * is not a member of the site; `former` someone who left the team; `system` the scheduler (publish at a time, clean-up).
 */
export type Who =
  | { self: true }
  | { email: string; name?: string }
  | { kind: 'member'; name?: string }
  | { kind: 'platform' | 'former' | 'system' }

/** The names people gave themselves, read once per person. */
export function namer(ctx: QueryCtx) {
  const names = new Map<string, string | undefined>()
  return async (user: string): Promise<string | undefined> => {
    if (!names.has(user)) names.set(user, (await ctx.db.query('userSettings').withIndex('by_user', (q) => q.eq('user', user)).unique())?.name)
    return names.get(user)
  }
}

/** Names for one reader; members, admins and names are read once per call. */
export async function labeler(ctx: QueryCtx, actor: Actor) {
  const members = await ctx.db.query('memberships').withIndex('by_site', (q) => q.eq('site', actor.site._id)).collect()
  const byUser = new Map(members.map((m) => [m.user as string, m]))
  const nameOf = namer(ctx)
  const admins = new Map<string, boolean>()
  const keys = new Map<string, string | null>()
  return {
    async who(user: string): Promise<Who> {
      if (user === 'system') return { kind: 'system' }
      if (user === actor.user.id) return { self: true }
      const member = byUser.get(user)
      if (member) {
        const name = await nameOf(user)
        const named = name ? { name } : {}
        return actor.role === 'staff' || !member.email ? { kind: 'member', ...named } : { email: member.email, ...named }
      }
      if (!admins.has(user)) admins.set(user, !!(await ctx.db.query('admins').withIndex('by_user', (q) => q.eq('user', user)).unique()))
      return { kind: admins.get(user) ? 'platform' : 'former' }
    },
    /** The label the person gave their agent key ("Claude Code"); null for no key or a deleted one. */
    async key(id: Id<'agentKeys'> | undefined): Promise<string | null> {
      if (!id) return null
      if (!keys.has(id)) keys.set(id, (await ctx.db.get(id))?.label ?? null)
      return keys.get(id)!
    },
  }
}

export type Labeler = Awaited<ReturnType<typeof labeler>>
