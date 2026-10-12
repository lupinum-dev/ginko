// Who did something (history, approvals, files), as data: the Studio words it in the reader's language.
import type { Id } from '../_generated/dataModel'
import type { QueryCtx } from '../_generated/server'
import type { Actor } from './access'

/**
 * A member's email where the reader may see it; otherwise what kind of person it was. Staff do not see the
 * addresses of colleagues (personal data), only their own. `platform` is an admin of the platform who is not a
 * member of the site; `former` someone who left the team; `system` the scheduler (publish at a time, clean-up).
 */
export type Who = { email: string } | { kind: 'member' | 'platform' | 'former' | 'system' }

/** Names for one reader; members and admins are read once per call. */
export async function labeler(ctx: QueryCtx, actor: Actor) {
  const members = await ctx.db.query('memberships').withIndex('by_site', (q) => q.eq('site', actor.site._id)).collect()
  const byUser = new Map(members.map((m) => [m.user as string, m]))
  const admins = new Map<string, boolean>()
  const keys = new Map<string, string | null>()
  return {
    async who(user: string): Promise<Who> {
      if (user === 'system') return { kind: 'system' }
      const member = byUser.get(user)
      if (member) return (actor.role === 'staff' && user !== actor.user.id) || !member.email ? { kind: 'member' } : { email: member.email }
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
