// Facts (`facts` in the site config, `:fact{name="…"}` in texts) as editors and agents need them: what each one
// shows now, which texts quote it, and a release that would leave a quote without its fact.
import type { Label } from '@lupinum/ginko'
import { factNames, factValues, msg, resolveEntry, todayIn, type FactValue, type Schema, type SchemaChange } from '@lupinum/ginko/internal'
import { v } from 'convex/values'
import type { Doc, Id } from './_generated/dataModel'
import { query, type QueryCtx } from './_generated/server'
import { actorFor } from './lib/access'
import { factQuotesOf, fieldLabelAt, type Data } from './lib/content'
import { labelOf } from './entries'

/** One text that quotes a fact, in the form the Studio's "used in" list reads (UsedInList). */
export interface FactQuote { entry: Id<'entries'>; brick: string; title: string; paths: string[]; fieldLabels: (Label | null)[]; deleted: false; state: 'draft' | 'live' }

/** A fact for the Studio: its value (FactValue), the label of its brick and the entry the Studio links to. */
export type StudioFact = FactValue & { brickLabel: Label; entry: Id<'entries'> | null }

/** The single bricks' data in `locale`, as the website serves it, and their entry IDs. */
async function singlesIn(ctx: QueryCtx, site: Doc<'sites'>, schema: Schema, locale: string) {
  const data: Record<string, Record<string, unknown>> = {}
  const entries: Record<string, Id<'entries'>> = {}
  for (const brick of new Set(factNames(schema.components).map((name) => name.split('.')[0]!))) {
    const row = await ctx.db.query('entries').withIndex('by_site_brick_deleted', (q) => q.eq('site', site._id).eq('brick', brick).eq('deletedAt', undefined)).first()
    if (!row || !Object.hasOwn(schema.bricks, brick)) continue
    entries[brick] = row._id
    data[brick] = resolveEntry(schema, brick, { id: row._id, order: row.order, data: row.data as Data, prints: row.prints }, { locale, files: () => undefined }).data
  }
  return { data, entries }
}

/** Every fact of the site with what it shows in `locale` (default: the main language), today. */
export async function factsOf(ctx: QueryCtx, site: Doc<'sites'>, locale?: string): Promise<StudioFact[]> {
  const schema = site.schema as Schema
  const shown = locale && schema.locales.includes(locale) ? locale : schema.locales[0]!
  const { data, entries } = await singlesIn(ctx, site, schema, shown)
  return factValues(schema, data, shown, todayIn(schema.timeZone)).map((fact) => ({ ...fact, brickLabel: schema.bricks[fact.brick]!.label, entry: entries[fact.brick] ?? null }))
}

/**
 * The texts that quote facts, by fact: every entry that is not removed (drafts too, they become pages), every
 * Markdown field and language. Only `names` when given. Sites are small; this reads each brick with texts once.
 */
export async function quotesOf(ctx: QueryCtx, site: Doc<'sites'>, names?: ReadonlySet<string>): Promise<Map<string, FactQuote[]>> {
  const schema = site.schema as Schema
  const out = new Map<string, FactQuote[]>()
  const hasText = (fields: Schema['bricks'][string]['fields']): boolean =>
    Object.values(fields).some((field) => !field.retired && (field.type === 'markdown' || (field.type === 'list' && hasText(field.of))))
  for (const [key, brick] of Object.entries(schema.bricks)) {
    if (brick.retired || brick.source === 'files' || !hasText(brick.fields)) continue
    const rows = await ctx.db.query('entries').withIndex('by_site_brick_deleted', (q) => q.eq('site', site._id).eq('brick', key).eq('deletedAt', undefined)).collect()
    for (const row of rows) {
      for (const [name, paths] of factQuotesOf(brick.fields, row.data as Data)) {
        if (names && !names.has(name)) continue
        const quote: FactQuote = {
          entry: row._id, brick: key, title: labelOf(schema, key, row.data as Data), paths,
          fieldLabels: paths.map((path) => fieldLabelAt(schema, key, path)), deleted: false, state: row.state ?? 'live',
        }
        out.set(name, [...(out.get(name) ?? []), quote])
      }
    }
  }
  return out
}

/**
 * The facts that `next` drops while texts still quote them: each would leave an empty spot on every page that shows
 * one of those texts. A release refuses them; `pnpm local:dev` shows them as warnings (SPEC 5.3).
 */
export async function droppedFactsInUse(ctx: QueryCtx, site: Doc<'sites'>, next: Schema): Promise<SchemaChange[]> {
  const kept = new Set(factNames(next.components))
  const dropped = new Set(factNames((site.schema as Schema).components).filter((name) => !kept.has(name)))
  if (!dropped.size) return []
  const quotes = await quotesOf(ctx, site, dropped)
  return [...quotes].map(([fact, texts]) => {
    const described = msg('diff.factInUse', { fact, count: texts.length, texts: texts.map((t) => `„${t.title}“`).join(', ') })
    const fix = msg('diff.fix.factInUse')
    return { path: `facts.${fact}`, kind: 'factInUse', ...described, fix: fix.message, fixMsg: { key: fix.key } }
  })
}

/** The Studio's facts: what each one shows in `locale` and where it comes from (the fact chip and its panel). */
export const values = query({
  args: { site: v.string(), locale: v.optional(v.string()) },
  handler: async (ctx, args): Promise<StudioFact[]> => {
    const actor = await actorFor(ctx, args.site)
    return factsOf(ctx, actor.site, args.locale)
  },
})

/** The texts that quote the facts of `brick` (its single entry's form lists them under each fact field). */
export const uses = query({
  args: { site: v.string(), brick: v.string() },
  handler: async (ctx, args): Promise<Record<string, FactQuote[]>> => {
    const actor = await actorFor(ctx, args.site)
    const names = new Set(factNames((actor.site.schema as Schema).components).filter((name) => name.startsWith(`${args.brick}.`)))
    if (!names.size) return {}
    return Object.fromEntries(await quotesOf(ctx, actor.site, names))
  },
})
