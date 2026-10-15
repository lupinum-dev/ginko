// The reach of the weekly reminder (SPEC 10): which content it can mail about, and to whom. The reminder itself
// (reminders.ts) and "Meine Seiten" (sites.mine, whether the reminder switch shows) read this one rule.
import { weeklyTask, type Schema } from '@lupinum/ginko/internal'
import type { Doc } from '../_generated/dataModel'

/** Who the reminder mails about a weekly task: owners, and staff who hold that task (SPEC 2.7). */
export const isReminded = (member: Pick<Doc<'memberships'>, 'role' | 'grants'>, taskRef: string) => member.role === 'owner' || member.grants.includes(taskRef)

/**
 * The site's live singles with a weekly task (see `weeklyTask`), with that task as "brick.task": what the reminder can
 * mail about. `staleOf` asks the same task, so a brick listed here is the one a mail names.
 */
export const weeklyBricks = (schema: Schema) => Object.entries(schema.bricks).flatMap(([key, brick]) => {
  const task = brick.kind === 'single' && !brick.retired ? weeklyTask(brick)?.task : undefined
  return task ? [{ key, brick, ref: `${key}.${task.id}` }] : []
})
