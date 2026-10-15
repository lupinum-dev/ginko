import { firstDayShown, workWeekOf, type WeekInfo } from './time.ts'
import type { Brick, Json, Schema, Task } from './types.ts'

export interface WeekState {
  /** The edit task that fixes it. */
  task: Extract<Task, { kind: 'edit' }>
  /** The date field the task presets to `@workWeek`. */
  field: string
  /** The week start stored in the field, if any. */
  stored: string | undefined
  /** Whether the stored week start is the work week of `today`, or that week is planned ahead. */
  current: boolean
}

/**
 * The "out of date" rule for weekly upkeep (UI.md 3): an edit task that presets a date field to
 * `@workWeek` says the content must be entered again each week. It is current while the field holds
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

/** The brick's weekly task: the first edit task that presets a date field to `@workWeek`. */
export function weeklyTask(brick: { fields: Record<string, { type: string }>; tasks?: readonly Task[] }): Pick<WeekState, 'task' | 'field'> | undefined {
  for (const task of brick.tasks ?? []) {
    if (task.kind !== 'edit' || !task.prefill) continue
    for (const [field, token] of Object.entries(task.prefill)) {
      if (token === '@workWeek' && brick.fields[field]?.type === 'date') return { task, field }
    }
  }
  return undefined
}

/**
 * The date field of a brick that holds the first day of a week: `plans.field` of a collection that plans weeks, else
 * the field of the weekly task (`weeklyTask`), else the first date field a task presets to `@workWeek` or
 * `@nextWorkWeek`. Validation wants a week start there (a week stored as a Thursday never shows), and the Studio offers
 * week shortcuts for it.
 */
export function weekStartField(brick: { fields: Record<string, { type: string }>; tasks?: readonly Task[]; plans?: { field: string } }): string | undefined {
  if (brick.plans) return brick.plans.field
  const weekly = weeklyTask(brick)
  if (weekly) return weekly.field
  for (const task of brick.tasks ?? []) {
    if (task.kind === 'remove') continue
    for (const [field, token] of Object.entries(task.prefill ?? {})) {
      if ((token === '@workWeek' || token === '@nextWorkWeek') && brick.fields[field]?.type === 'date') return field
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

/**
 * The value of a planned change (`planned`) once its day has come: `next` when `from` is `today` or earlier, else
 * undefined. From that day the site shows it in place of `field`, so a task opens on it and the Studio lists it.
 * `today` is in the site's time zone.
 */
export function duePlan(brick: Pick<Brick, 'planned'>, data: Record<string, Json>, today: string): Json | undefined {
  const plan = brick.planned
  if (!plan) return undefined
  const next = data[plan.next]
  const from = data[plan.from]
  return next !== undefined && next !== null && typeof from === 'string' && from <= today ? next : undefined
}

/**
 * Whether a create task asks for `key`: every field of the brick but the address (made from the title) and the plan of
 * a planned change (`planned`), which needs a value in effect to replace. The Studio's sheet and the agent door's tool
 * both use this rule.
 */
export function createAsks(brick: Pick<Brick, 'fields' | 'planned'>, key: string): boolean {
  const field = Object.hasOwn(brick.fields, key) ? brick.fields[key] : undefined
  return !!field && field.type !== 'slug' && key !== brick.planned?.next && key !== brick.planned?.from
}

/**
 * The day a save shows on the website when that is later than `today` (the site's time zone), else undefined (it shows
 * at once): a week planned ahead (`plans`) from its first shown day (`firstDayShown`); a save that changed only the
 * plan of a planned change (`planned`) from the plan's date. `changed` are the root fields the save wrote.
 */
export function liveFrom(schema: Pick<Schema, 'bricks' | 'week'>, brickKey: string, data: Record<string, Json>, changed: readonly string[], today: string): string | undefined {
  const brick = Object.hasOwn(schema.bricks, brickKey) ? schema.bricks[brickKey] : undefined
  if (!brick) return undefined
  if (brick.kind === 'collection' && brick.plans) {
    const start = data[brick.plans.field]
    const first = typeof start === 'string' ? firstDayShown(start, schema.week) : undefined
    return first && first > today ? first : undefined
  }
  const plan = brick.planned
  if (!plan || !changed.length || !changed.every((root) => root === plan.next || root === plan.from)) return undefined
  const from = data[plan.from]
  const next = data[plan.next]
  return next !== undefined && next !== null && typeof from === 'string' && from > today ? from : undefined
}
