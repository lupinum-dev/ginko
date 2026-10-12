// Task queries (SPEC 2.7). `prefill` gives the starting values of a task's form. The server
// resolves date tokens in the site's time zone; mutations never apply these values.
import type { Json } from '@lupinum/ginko'
import { isTranslatable, resolveToken, weekOfSchema, type Schema } from '@lupinum/ginko/internal'
import { v, type ObjectType } from 'convex/values'
import { query, type QueryCtx } from './_generated/server'
import { actorFor, entryOf, fail, taskBrickOf, type Actor } from './lib/access'

const prefillArgs = { site: v.string(), task: v.string(), entry: v.optional(v.string()) }

export const prefill = query({ args: prefillArgs, handler: async (ctx, args) => prefillAs(ctx, await actorFor(ctx, args.site), args) })

/** `prefill` for an actor already known (platform or agent door, SPEC 16). */
export async function prefillAs(ctx: QueryCtx, actor: Actor, args: ObjectType<typeof prefillArgs>): Promise<Json> {
  const schema = actor.site.schema as Schema
  // Every member may read the whole site (SPEC 2.7), so the task is looked up without grants.
  const [brickKey, taskId, ...rest] = args.task.split('.')
  const brick = brickKey && Object.hasOwn(schema.bricks, brickKey) ? schema.bricks[brickKey] : undefined
  const task = brick && taskId && rest.length === 0 ? brick.tasks?.find((t) => t.id === taskId) : undefined
  if (!brickKey || !brick || !task) fail('INVALID', 'errors.taskNotFound', undefined, { task: args.task })

  const main = schema.locales[0]!
  const prefill = 'prefill' in task ? (task.prefill ?? {}) : {}
  const values: Record<string, Json> = {}
  for (const [key, raw] of Object.entries(prefill)) {
    const field = Object.hasOwn(brick.fields, key) ? brick.fields[key] : undefined
    if (!field) continue
    const token = typeof raw === 'string' ? resolveToken(raw, schema.timezone, weekOfSchema(schema)) : undefined
    const value: Json = token ?? raw
    // Literal text of a translatable field starts in the main language.
    values[key] = isTranslatable(field) && typeof value === 'string' ? { [main]: value } : value
  }

  // An edit starts from the stored values of the fields it touches; the prefill overrides them.
  let stored: Record<string, Json> = {}
  if (task.kind === 'edit' && args.entry !== undefined) {
    const entry = await entryOf(ctx, actor, args.entry)
    // The entry of the task's brick, or a week planned ahead that stands in for it this week.
    if (taskBrickOf(schema, args.task, entry) !== brickKey) fail('NOT_FOUND', 'errors.entryNotFound')
    const data = entry.data as Record<string, Json>
    stored = Object.fromEntries(task.fields.filter((f) => data[f] !== undefined).map((f): [string, Json] => [f, data[f]!]))
  }
  return { ...stored, ...values }
}
