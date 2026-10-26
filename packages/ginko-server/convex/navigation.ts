// The side navigation of a manually ordered collection whose pages nest through a `parent` ref to the same collection
// (the docs layer): the Studio reads it as a tree, moves a page (order, parent and the section/tab handover in one
// step) and sets, renames or removes a section or tab heading. The rules are core's (`outline`, `placePlan`), the same the website uses.
import type { CollectionBrick, Field, Json, Locale } from '@lupinum/ginko'
import { isNavTree, isTranslatable, outline, placePlan, sortEntries, validate, walkOutline, type OutlineRow, type Place, type Schema } from '@lupinum/ginko/internal'
import { v } from 'convex/values'
import type { Doc, Id } from './_generated/dataModel'
import { mutation, query, type MutationCtx, type QueryCtx } from './_generated/server'
import { actorFor, byOf, checkRev, entryOf, fail, idempotent, type Actor } from './lib/access'
import { mergeField, nextPrints, type Data } from './lib/content'
import { msg, recorded } from './lib/history'
import { commitEntry, lookupsFor } from './lib/write'
import { titleOf } from './lib/list'

/** The fields that place a page in the navigation; a move checks and writes only these. */
const PLACE_FIELDS = ['parent', 'section', 'tab'] as const

/** A collection shown as a tree: manual order and a `parent` ref to itself. Fails for any other brick. */
export function treeBrick(schema: Schema, key: string): CollectionBrick {
  const brick = Object.hasOwn(schema.bricks, key) ? schema.bricks[key] : undefined
  if (!brick || brick.retired) fail('INVALID', 'errors.brickNoLongerEditable')
  if (!isNavTree(key, brick)) fail('INVALID', 'errors.notANavigationTree', undefined, { brick: key })
  return brick
}

/** A text field's value in one language ('' counts as none); undefined when the brick has no such text field. */
function textIn(field: Field | undefined, value: unknown, locale: Locale, main: Locale): string | undefined {
  if (!field || (field.type !== 'text' && field.type !== 'longtext')) return undefined
  const text = typeof value === 'string' ? value : value && typeof value === 'object' ? ((value as Record<string, unknown>)[locale] ?? (value as Record<string, unknown>)[main]) : undefined
  return typeof text === 'string' && text.trim() ? text : undefined
}

/** The brick's pages that are not in the trash, drafts included, in stored order. */
async function pagesOf(ctx: QueryCtx, site: Id<'sites'>, key: string, brick: CollectionBrick): Promise<Doc<'entries'>[]> {
  const rows = await ctx.db.query('entries').withIndex('by_site_brick_deleted', (q) => q.eq('site', site).eq('brick', key).eq('deletedAt', undefined)).collect()
  const byId = new Map(rows.map((r) => [r._id as string, r]))
  return sortEntries(brick, rows.map((r) => ({ id: r._id, order: r.order, data: r.data }))).map((s) => byId.get(s.id)!)
}

function outlineRows(schema: Schema, brick: CollectionBrick, pages: Doc<'entries'>[]): OutlineRow[] {
  const main = schema.locales[0]!
  const ids = new Set(pages.map((p) => p._id as string))
  return pages.map((p) => {
    const data = p.data as Data
    const parent = typeof data.parent === 'string' && ids.has(data.parent) ? data.parent : undefined
    const section = textIn(brick.fields.section, data.section, main, main)
    const tab = textIn(brick.fields.tab, data.tab, main, main)
    return { id: p._id, ...(parent ? { parent } : {}), ...(section ? { section } : {}), ...(tab ? { tab } : {}) }
  })
}

/**
 * The pages of a tree collection in stored order, with what the Studio's tree shows and checks: title, short title,
 * badge, state, parent, own section and tab (in `language`, else the main one) and the revisions a move is based on.
 * Any member may read (SPEC 2.7).
 */
export const tree = query({
  args: { site: v.string(), brick: v.string(), language: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const actor = await actorFor(ctx, args.site)
    const schema = actor.site.schema as Schema
    const brick = treeBrick(schema, args.brick)
    const main = schema.locales[0]!
    const language = (args.language && schema.locales.includes(args.language as Locale) ? args.language : main) as Locale
    const pages = await pagesOf(ctx, actor.site._id, args.brick, brick)
    const rows = outlineRows(schema, brick, pages)
    return pages.map((p, i) => {
      const data = p.data as Data
      const text = (key: string) => textIn(brick.fields[key], data[key], language, main) ?? null
      return {
        _id: p._id, rev: p.rev, state: p.state ?? 'live', publishAt: p.publishAt ?? null,
        title: titleOf(schema, brick, data, language), navTitle: text('navTitle'), badge: text('badge'),
        // The stored parent even when it is in the trash: the tree says why the page shows elsewhere on the website.
        parent: typeof data.parent === 'string' ? data.parent : null,
        section: rows[i]!.section ?? null, tab: rows[i]!.tab ?? null,
        // Labels in the language shown, for the headings (the rules run on the main language).
        sectionLabel: text('section'), tabLabel: text('tab'),
      }
    })
  },
})

const placeArg = v.union(
  v.object({ parent: v.string(), after: v.optional(v.string()) }),
  v.object({ after: v.string() }),
  v.object({ before: v.string() }),
)

/** Owners and admins only: no task covers the structure (SPEC 2.7), as for `entries.move`. */
function refuseStaff(actor: Actor) {
  if (actor.role === 'staff') fail('FORBIDDEN', 'errors.notYourTask')
}

/** Refuses when the fields `roots` of the entry changed after the revision the person saw. */
function refuseChanged(entry: Doc<'entries'>, baseRev: number, roots: readonly string[]) {
  if (entry.deletedAt) fail('CHANGED_SINCE', 'errors.thisEntryDeletedSince')
  const current = { entry: entry._id, rev: entry.rev, data: entry.data as Json, fieldRevs: entry.fieldRevs, deleted: false }
  if (baseRev > entry.rev) fail('CHANGED_SINCE', 'errors.someoneChangedMeanwhile', undefined, current)
  const conflicts = roots.filter((r) => (entry.fieldRevs[r] ?? 0) > baseRev)
  if (conflicts.length) fail('CHANGED_SINCE', 'errors.someoneChangedMeanwhile', undefined, { ...current, conflicts })
}

/** Writes `data` into one entry with the shared write path (revisions, history, budget); re-reads the site each time. */
async function writeData(ctx: MutationCtx, actor: Actor, entry: Doc<'entries'>, brick: CollectionBrick, roots: string[], data: Data, line: ReturnType<typeof msg>, opId: string) {
  const schema = actor.site.schema as Schema
  const site = (await ctx.db.get(actor.site._id))!
  const prints = nextPrints({ fields: brick.fields, roots, before: entry.data as Data, after: data, prints: entry.prints, main: schema.locales[0]!, confirm: undefined })
  return commitEntry(ctx, { actor: { ...actor, site }, entry, fields: brick.fields, roots, data, prints, kind: 'place', history: recorded(line, schema), opId })
}

/**
 * Moves one page, with its subpages, to `place` in a tree collection (SPEC 4.2): its order, its parent, and the
 * section or tab heading it hands over or takes over, in one step. Every other page keeps where the website shows it
 * (core `placePlan`). `baseRev` is the page's revision the person saw: a change of its place since then is a conflict;
 * text edits are not. Refuses a place inside the page itself or its subpages. Owners and admins only.
 */
export const move = mutation({
  args: { site: v.string(), opId: v.string(), entry: v.string(), baseRev: v.number(), place: placeArg },
  handler: async (ctx, args): Promise<Json> => {
    checkRev(args.baseRev)
    const actor = await actorFor(ctx, args.site)
    return idempotent(ctx, actor, args, async () => {
      const entry = await entryOf(ctx, actor, args.entry)
      const schema = actor.site.schema as Schema
      const brick = treeBrick(schema, entry.brick)
      refuseStaff(actor)
      refuseChanged(entry, args.baseRev, PLACE_FIELDS)

      const pages = await pagesOf(ctx, actor.site._id, entry.brick, brick)
      const rows = outlineRows(schema, brick, pages)
      const plan = placePlan(rows, entry._id, args.place as Place)
      if (plan === 'cycle') fail('INVALID', 'errors.placeInsideItself')
      if (plan === 'missing') fail('CHANGED_SINCE', 'errors.placeGone')
      if (plan === 'invalid') fail('INVALID', 'errors.placeInvalid')
      if (!Object.keys(plan.patch).length && plan.order.every((id, i) => id === pages[i]!._id)) {
        return { moved: false, contentRev: actor.site.contentRev }
      }

      const byId = new Map(pages.map((p) => [p._id as string, p]))
      const block = new Set(walkOutline([walkOutline(outline(rows)).find((n) => n.row.id === entry._id)!]).map((n) => n.row.id))
      const orders = newOrders(plan.order.map((id) => byId.get(id)!), block)
      const title = titleOf(schema, brick, entry.data as Data, undefined) ?? entry.brick
      let publicChange = false
      let committed = false

      for (const [id, p] of Object.entries(plan.patch)) {
        const page = (await ctx.db.get(id as Id<'entries'>))!
        const before = page.data as Data
        const data: Data = { ...before }
        if (p.parent === null) delete data.parent
        else if (p.parent !== undefined) data.parent = p.parent
        for (const key of ['section', 'tab'] as const) {
          const w = p[key]
          if (w === null) delete data[key]
          else if (w) data[key] = (byId.get(w.from)!.data as Data)[key]!
        }
        const roots = PLACE_FIELDS.filter((k) => p[k] !== undefined)
        const pageTitle = titleOf(schema, brick, before, undefined) ?? entry.brick
        await writeData(ctx, actor, page, brick, roots, data, id === entry._id ? msg('history.placed', { title }) : msg('history.headingHandedOver', { title: pageTitle, from: title }), args.opId)
        if ((page.state ?? 'live') === 'live') { publicChange = true; committed = true }
      }

      for (const [id, order] of orders) {
        const page = (await ctx.db.get(id as Id<'entries'>))!
        // A page whose data was written above has its new revision already; an order alone counts as a change too.
        await ctx.db.patch(page._id, plan.patch[id] ? { order } : { order, rev: page.rev + 1 })
        if ((page.state ?? 'live') === 'live') publicChange = true
      }

      let site = (await ctx.db.get(actor.site._id))!
      if (publicChange && !committed) {
        await ctx.db.patch(site._id, { contentRev: site.contentRev + 1 })
        site = (await ctx.db.get(site._id))!
      }
      // The history line of a move that only changed the order (with data, `commitEntry` wrote it).
      if (!plan.patch[entry._id]) {
        const now = (await ctx.db.get(entry._id))!
        await ctx.db.insert('changes', {
          site: site._id, entry: entry._id, brick: entry.brick, ...byOf(actor), opId: args.opId, kind: 'reorder',
          ...recorded(msg('history.placed', { title }), schema), entryRev: now.rev, contentRev: site.contentRev, at: Date.now(),
        })
      }
      return { moved: true, contentRev: site.contentRev }
    })
  },
})

/**
 * New order values for the pages in `order` (the brick's live pages in their new order) that need one: the block
 * between its neighbours, or every page 1..n when the gap is used up or older data has equal values. Pages in the
 * trash keep theirs (a restore puts a page last).
 */
function newOrders(order: Doc<'entries'>[], block: Set<string>): Map<string, number> {
  const out = new Map<string, number>()
  const first = order.findIndex((p) => block.has(p._id))
  const last = first + block.size - 1
  const lo = order[first - 1]?.order
  const hi = order[last + 1]?.order
  const step = lo !== undefined && hi !== undefined ? (hi - lo) / (block.size + 1) : 1
  const start = lo ?? (hi !== undefined ? hi - block.size - 1 : 0)
  const values = Array.from({ length: block.size }, (_, i) => start + step * (i + 1))
  const others = order.filter((p) => !block.has(p._id)).map((p) => p.order)
  const fits = others.every((o, i) => i === 0 || o > others[i - 1]!)
    && [lo ?? -Infinity, ...values, hi ?? Infinity].every((o, i, all) => i === 0 || o > all[i - 1]!)
  if (fits) {
    order.slice(first, last + 1).forEach((p, i) => { if (p.order !== values[i]) out.set(p._id, values[i]!) })
    return out
  }
  order.forEach((p, i) => { if (p.order !== i + 1) out.set(p._id, i + 1) })
  return out
}

/**
 * Sets a section or tab heading on a top-level page, in one language (SPEC 4.2): a page without one starts a new
 * heading there (the pages after it join it); a page that starts one renames it, together with the following pages of
 * the same run (a section) or tab that repeat the text, so the heading stays one group; an empty text removes the
 * heading in every language (its pages join the heading before). `baseRev`: the page's revision. Goes online at once,
 * like a move. Owners and admins only.
 */
export const heading = mutation({
  args: { site: v.string(), opId: v.string(), entry: v.string(), baseRev: v.number(), field: v.union(v.literal('section'), v.literal('tab')), locale: v.string(), text: v.string() },
  handler: async (ctx, args): Promise<Json> => {
    checkRev(args.baseRev)
    const actor = await actorFor(ctx, args.site)
    return idempotent(ctx, actor, args, async () => {
      const entry = await entryOf(ctx, actor, args.entry)
      const schema = actor.site.schema as Schema
      const brick = treeBrick(schema, entry.brick)
      const field = brick.fields[args.field]
      if (!field || field.type !== 'text') fail('INVALID', 'errors.notANavigationTree', undefined, { brick: entry.brick })
      refuseStaff(actor)
      refuseChanged(entry, args.baseRev, [args.field, 'parent'])
      const locale = args.locale as Locale
      if (!schema.locales.includes(locale)) fail('INVALID', 'errors.languageNotSetUp', { locale })
      const text = args.text.trim()

      const main = schema.locales[0]!
      const pages = await pagesOf(ctx, actor.site._id, entry.brick, brick)
      const roots = outline(outlineRows(schema, brick, pages))
      const at = roots.findIndex((r) => r.row.id === entry._id)
      // Nested pages follow their parent: the website ignores a heading on them.
      if (at < 0) fail('INVALID', 'errors.headingOnSubpage')
      const own = (p: Doc<'entries'>) => textIn(field, (p.data as Data)[args.field], locale, main)
      const old = own(entry)
      if (!old && !text) return { changed: 0, contentRev: actor.site.contentRev }
      if (old === text) return { changed: 0, contentRev: actor.site.contentRev }
      const byId = new Map(pages.map((p) => [p._id as string, p]))
      // A new heading starts at this page only; a tab is all roots with that name; a section the run from this page.
      let targets: Doc<'entries'>[] = [entry]
      if (old && args.field === 'tab') targets = roots.map((r) => byId.get(r.row.id)!).filter((p) => own(p) === old)
      else if (old) {
        const run = [roots[at]!]
        for (let i = at + 1; i < roots.length && roots[i]!.section === roots[at]!.section && roots[i]!.tab === roots[at]!.tab; i++) run.push(roots[i]!)
        targets = run.map((r) => byId.get(r.row.id)!).filter((p) => own(p) === old)
      }
      const line = !text ? msg(args.field === 'tab' ? 'history.tabRemoved' : 'history.sectionRemoved', { name: old! })
        : !old ? msg(args.field === 'tab' ? 'history.tabStarted' : 'history.sectionStarted', { name: text })
        : msg(args.field === 'tab' ? 'history.tabRenamed' : 'history.sectionRenamed', { from: old, to: text })

      for (const page of targets) {
        const before = page.data as Data
        const data: Data = { ...before }
        if (!text) delete data[args.field]
        else data[args.field] = mergeField(field, before[args.field] as Json | undefined, isTranslatable(field) ? { [locale]: text } : text, locale)!
        const { errors } = await validate(schema, page.brick, data, { mode: 'patch', changed: new Set([args.field]), ...(await lookupsFor(ctx, actor.site._id, brick.fields, data)) })
        if (errors.length) fail('INVALID', 'errors.pleaseCheckMarkedFields', undefined, { errors: errors as unknown as Json })
        await writeData(ctx, actor, page, brick, [args.field], data, line, args.opId)
      }
      const site = (await ctx.db.get(actor.site._id))!
      return { changed: targets.length, contentRev: site.contentRev }
    })
  },
})
