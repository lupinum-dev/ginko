// The reach of the weekly reminder (SPEC 10): which content it can mail about, and to whom. The reminder itself
// (reminders.ts) and "Meine Seiten" (sites.mine, whether the reminder switch shows) read this one rule.
import { weeklyTask, type Brick, type Schema } from '@lupinum/ginko/internal'
import type { Doc } from '../_generated/dataModel'

/** Who the reminder mails about a brick: owners, and staff who hold one of the tasks that fix it (SPEC 2.7). */
export const isReminded = (member: Pick<Doc<'memberships'>, 'role' | 'grants'>, refs: readonly string[]) => member.role === 'owner' || refs.some((ref) => member.grants.includes(ref))

export interface ReminderBrick {
  key: string
  brick: Brick
  /** The weekly task as "brick.task" (see `weeklyTask`): the reminder asks `staleOf` about it. */
  weekly?: string
  /** The tasks whose holders are mailed: the weekly task, else every task of the brick. */
  refs: string[]
}

/**
 * The site's live bricks the reminder can mail about: singles with a weekly task (`staleOf` asks the same task, so a
 * brick listed here is the one a mail names) and bricks with a `status`, whose due line is mailed (lib/status.ts).
 */
export const reminderBricks = (schema: Schema): ReminderBrick[] => Object.entries(schema.bricks).flatMap(([key, brick]) => {
  if (brick.retired) return []
  const task = brick.kind === 'single' ? weeklyTask(brick)?.task : undefined
  if (task) return [{ key, brick, weekly: `${key}.${task.id}`, refs: [`${key}.${task.id}`] }]
  return brick.status ? [{ key, brick, refs: (brick.tasks ?? []).map((t) => `${key}.${t.id}`) }] : []
})
