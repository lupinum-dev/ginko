// Studio search (⌘K, SPEC 4.2): entries, bricks and tasks that match the words. The entry search is
// the one of the agent door (lib/search.ts); bricks match by their label or a field's, tasks by label.
import type { Label } from '@lupinum/ginko'
import { labelOf, ordered, type Schema } from '@lupinum/ginko/internal'

import { v } from 'convex/values'
import { query } from './_generated/server'
import { actorFor } from './lib/access'
import { taskTools } from './lib/agentTools'
import { labelMatches, searchEntries } from './lib/search'

/** A label in every language it has, so "menu" finds the area whose German label is "Speisekarte". */
const allLanguages = (label: Label) => (typeof label === 'string' ? label : Object.values(label).join(' '))

export const LIMIT_DEFAULT = 20
export const LIMIT_MAX = 50

/**
 * Any member. Entries: best first, deleted ones never. Bricks: in schema order, those named by the words first, then
 * those found by a field (with `field`, its key). Tasks: in schema order. Staff find only what they can open: the tasks
 * they may run, and entries and bricks of the areas they hold a task in. That is the Studio's own rule for the areas it
 * opens (useAll.ts `editable`). Reading stays site-wide (SPEC 2.7): the agent door's search is not filtered.
 */
export const studio = query({
  args: { site: v.string(), query: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const actor = await actorFor(ctx, args.site)
    const schema = actor.site.schema as Schema
    const main = schema.locales[0]!
    const asked = args.limit !== undefined && Number.isFinite(args.limit) ? Math.floor(args.limit) : LIMIT_DEFAULT
    const limit = Math.min(Math.max(asked, 1), LIMIT_MAX)
    const text = args.query.trim().slice(0, 200)
    if (!text) return { entries: [], bricks: [], tasks: [] }

    const tools = taskTools(actor)
    const open = actor.role === 'staff' ? new Set(tools.map((tool) => tool.brick)) : undefined
    const entries = (await searchEntries(ctx, actor, { query: text, limit, within: open })).map((hit) => ({
      entry: hit.entry, brick: hit.brick, brickLabel: labelOf(schema.bricks[hit.brick]!.label, main, main), label: hit.label, snippet: hit.snippet, state: hit.state,
    }))
    const live = Object.entries(schema.bricks).filter(([brick, def]) => !def.retired && (!open || open.has(brick)))
    const byName = live.filter(([, def]) => labelMatches(allLanguages(def.label), text))
    // An area is also found by one of its fields ("Telefon" finds "Adresse und Kontakt"), after those named so.
    // The slug is left out: the Studio calls it "Webadresse", whatever the schema says.
    const byField = live.flatMap(([brick, def]) => {
      if (byName.some(([named]) => named === brick)) return []
      const hit = ordered(def.fields).find(([, f]) => !f.retired && f.type !== 'slug' && labelMatches(allLanguages(f.label), text))
      return hit ? [[brick, def, hit[0]] as const] : []
    })
    const bricks = [...byName.map(([brick, def]) => [brick, def, undefined] as const), ...byField]
      .slice(0, limit)
      .map(([brick, def, field]) => ({ brick, label: labelOf(def.label, main, main), kind: def.kind, ...(field ? { field } : {}) }))
    const tasks = tools
      .filter((tool) => labelMatches(allLanguages(tool.task.label), text))
      .slice(0, limit)
      .map((tool) => ({ id: tool.ref, label: labelOf(tool.task.label, main, main), brick: tool.brick, brickLabel: labelOf(schema.bricks[tool.brick]!.label, main, main) }))
    return { entries, bricks, tasks }
  },
})
