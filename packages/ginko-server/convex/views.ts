// Saved list views (SPEC 4.2): a person's named filter and sort of one brick's entry list.
// A view belongs to one person; nobody else sees it, not even an admin. It is no content, so it
// writes no change row and needs no opId; the name is unique per person and brick.
import type { Json } from '@lupinum/ginko'
import { labelOf, type Schema } from '@lupinum/ginko/internal'
import { v } from 'convex/values'
import type { Doc } from './_generated/dataModel'
import { mutation, query, type QueryCtx } from './_generated/server'
import { actorFor, fail, type Actor } from './lib/access'
import { byteSize } from './lib/content'

export const VIEWS_MAX = 20
export const NAME_MIN = 1
export const NAME_MAX = 60
const TEXT_MAX = 200
/** Filters are small values (a choice, a flag, a range); this keeps a row far below any document limit. */
const FILTERS_BYTES = 4 * 1024

export interface ViewQuery {
  text?: string
  filters?: Record<string, Json>
  sort?: { field: string; dir: 'asc' | 'desc' }
}

const isObject = (value: unknown): value is Record<string, Json> => typeof value === 'object' && value !== null && !Array.isArray(value)

/** The query in its stored form, or INVALID. Unknown keys are refused; filters and sort may only name live fields of the brick. */
export function checkQuery(schema: Schema, brick: string, input: unknown): ViewQuery {
  const def = Object.hasOwn(schema.bricks, brick) ? schema.bricks[brick] : undefined
  if (!def || def.retired) fail('INVALID', 'errors.brickNotFoundAnymore')
  if (def.kind !== 'collection') fail('INVALID', 'errors.viewOnlyForCollections', undefined, { brick })
  if (!isObject(input)) fail('INVALID', 'errors.viewInvalid')
  for (const key of Object.keys(input)) if (key !== 'text' && key !== 'filters' && key !== 'sort') fail('INVALID', 'errors.keyNotInView', { key }, { key })
  const live = (field: string) => Object.hasOwn(def.fields, field) && !def.fields[field]!.retired
  const out: ViewQuery = {}

  if (input.text !== undefined) {
    if (typeof input.text !== 'string' || input.text.length > TEXT_MAX) fail('INVALID', 'errors.searchTextInvalid', { textMax: TEXT_MAX })
    if (input.text.trim()) out.text = input.text.trim()
  }
  if (input.filters !== undefined) {
    if (!isObject(input.filters)) fail('INVALID', 'errors.filtersInvalid')
    for (const field of Object.keys(input.filters)) {
      if (!live(field)) fail('INVALID', 'errors.fieldNotInBrick', { field, label: labelOf(def.label, schema.locales[0]!, schema.locales[0]!) }, { field })
    }
    if (byteSize(input.filters) > FILTERS_BYTES) fail('TOO_LARGE', 'errors.filtersTooLarge')
    if (Object.keys(input.filters).length) out.filters = input.filters
  }
  if (input.sort !== undefined) {
    const sort = input.sort
    if (!isObject(sort) || typeof sort.field !== 'string' || (sort.dir !== 'asc' && sort.dir !== 'desc') || Object.keys(sort).length !== 2) {
      fail('INVALID', 'errors.sortInvalid')
    }
    if (!live(sort.field)) fail('INVALID', 'errors.fieldNotInBrick', { field: sort.field, label: labelOf(def.label, schema.locales[0]!, schema.locales[0]!) }, { field: sort.field })
    out.sort = { field: sort.field, dir: sort.dir }
  }
  return out
}

const shown = (row: Doc<'views'>) => ({ id: row._id, brick: row.brick, name: row.name, query: row.query as ViewQuery })

async function ownRows(ctx: QueryCtx, actor: Actor, brick: string) {
  return ctx.db.query('views').withIndex('by_site_user_brick', (q) => q.eq('site', actor.site._id).eq('user', actor.user.id).eq('brick', brick)).collect()
}

/** Creates a view, or with `id` renames and changes one of the caller's own. */
export const save = mutation({
  args: { site: v.string(), id: v.optional(v.string()), brick: v.string(), name: v.string(), query: v.any() },
  handler: async (ctx, args) => {
    const actor = await actorFor(ctx, args.site)
    const name = args.name.trim()
    if (name.length < NAME_MIN || name.length > NAME_MAX) fail('INVALID', 'errors.nameLengthRange', { nameMin: NAME_MIN, nameMax: NAME_MAX })
    const query = checkQuery(actor.site.schema as Schema, args.brick, args.query)
    const own = await ownRows(ctx, actor, args.brick)
    const same = (row: Doc<'views'>) => row.name.toLowerCase() === name.toLowerCase()

    if (args.id !== undefined) {
      const id = ctx.db.normalizeId('views', args.id)
      const row = id ? await ctx.db.get(id) : null
      // Another person's view looks like a missing one.
      if (!row || row.site !== actor.site._id || row.user !== actor.user.id) fail('NOT_FOUND', 'errors.viewNotFound')
      if (row.brick !== args.brick) fail('INVALID', 'errors.viewCannotMoveBrick')
      if (own.some((other) => other._id !== row._id && same(other))) fail('INVALID', 'errors.nameAlreadyUsedHere', undefined, { name })
      await ctx.db.patch(row._id, { name, query })
      return { id: row._id }
    }
    if (own.length >= VIEWS_MAX) fail('INVALID', 'errors.viewLimitPerBrick', { viewsMax: VIEWS_MAX }, { max: VIEWS_MAX })
    if (own.some(same)) fail('INVALID', 'errors.nameAlreadyUsedHere', undefined, { name })
    return { id: await ctx.db.insert('views', { site: actor.site._id, user: actor.user.id, brick: args.brick, name, query }) }
  },
})

export const remove = mutation({
  args: { site: v.string(), id: v.string() },
  handler: async (ctx, args) => {
    const actor = await actorFor(ctx, args.site)
    const id = ctx.db.normalizeId('views', args.id)
    const row = id ? await ctx.db.get(id) : null
    if (!row || row.site !== actor.site._id || row.user !== actor.user.id) fail('NOT_FOUND', 'errors.viewNotFound')
    await ctx.db.delete(row._id)
    return null
  },
})

/** The caller's own views of a brick, oldest first. */
export const list = query({
  args: { site: v.string(), brick: v.string() },
  handler: async (ctx, args) => {
    const actor = await actorFor(ctx, args.site)
    return (await ownRows(ctx, actor, args.brick)).map(shown)
  },
})
