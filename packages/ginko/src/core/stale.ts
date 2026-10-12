import { workWeekOf, type WeekInfo } from './time.ts'
import type { Json, Schema, Task } from './types.ts'

export interface WeekState {
  /** The edit task that fixes it. */
  task: Extract<Task, { kind: 'edit' }>
  /** The date field the task presets to `@thisWeek`. */
  field: string
  /** The week start stored in the field, if any. */
  stored: string | undefined
  /** Whether the stored week start is the work week of `today`, or that week is planned ahead. */
  current: boolean
}

/**
 * The "out of date" rule for weekly upkeep (UI.md 3): an edit task that presets a date field to
 * `@thisWeek` says the content must be entered again each week. It is current while the field holds
 * the first day of today's work week (the coming week once only weekend days are left, see `workWeekOf`).
 * A week planned ahead in a collection (`plans`, see `plannedWeeks`) counts as entered too. Undefined when the brick has no such task. The Studio shows the state; the weekly reminder mail asks the same question.
 */
export function staleOf(
  brick: { fields: Record<string, { type: string }>; tasks?: readonly Task[] },
  data: Record<string, Json> | undefined,
  today: string,
  week: WeekInfo,
  planned: readonly string[] = [],
): WeekState | undefined {
  const weekly = weeklyTask(brick)
  if (!weekly) return undefined
  const stored = typeof data?.[weekly.field] === 'string' ? data[weekly.field] as string : undefined
  return { ...weekly, stored, current: stored === workWeekOf(today, week) || planned.includes(workWeekOf(today, week)) }
}

/** The brick's weekly task: the first edit task that presets a date field to `@thisWeek`. */
export function weeklyTask(brick: { fields: Record<string, { type: string }>; tasks?: readonly Task[] }): Pick<WeekState, 'task' | 'field'> | undefined {
  for (const task of brick.tasks ?? []) {
    if (task.kind !== 'edit' || !task.prefill) continue
    for (const [field, token] of Object.entries(task.prefill)) {
      if (token === '@thisWeek' && brick.fields[field]?.type === 'date') return { task, field }
    }
  }
  return undefined
}

/**
 * The week starts planned ahead for the single brick `singleKey`: the `plans.field` of every entry of the
 * collections that plan it. The caller passes only live entries (no drafts, nothing deleted).
 */
export function plannedWeeks(
  schema: Pick<Schema, 'bricks'>,
  singleKey: string,
  entriesOf: (brickKey: string) => readonly { data: Record<string, Json> }[],
): string[] {
  const weeks: string[] = []
  for (const [key, brick] of Object.entries(schema.bricks)) {
    if (brick.kind !== 'collection' || brick.retired || brick.plans?.brick !== singleKey) continue
    for (const entry of entriesOf(key)) {
      const start = entry.data[brick.plans.field]
      if (typeof start === 'string') weeks.push(start)
    }
  }
  return weeks
}

/**
 * Whether the weekly task `task` of the single `singleKey` edits this entry of `entryBrick` instead of the single:
 * the entry is a week planned ahead (`plans`) for `thisWeek`, so it is what the website shows this week. Then the
 * task's grant covers this entry (a cook with only "this week's lunch" fills the planned week). The caller passes
 * live entries only and `thisWeek` from `workWeekOf` in the site's time zone.
 */
export function plansThisWeek(
  schema: Pick<Schema, 'bricks'>,
  singleKey: string,
  task: Task,
  entryBrick: string,
  data: Record<string, Json>,
  thisWeek: string,
): boolean {
  const single = Object.hasOwn(schema.bricks, singleKey) ? schema.bricks[singleKey] : undefined
  const plan = Object.hasOwn(schema.bricks, entryBrick) ? schema.bricks[entryBrick] : undefined
  if (single?.kind !== 'single' || plan?.kind !== 'collection' || plan.retired || plan.plans?.brick !== singleKey) return false
  return weeklyTask(single)?.task.id === task.id && data[plan.plans.field] === thisWeek
}
