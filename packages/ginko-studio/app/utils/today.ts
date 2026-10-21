// Today's pure rules (UI.md 3): which card a plan brick sits in, which tasks are buttons and which go into the
// section's "⋯" menu, what waits for the person and how many things the verdict line counts. Generic: nothing here
// knows the restaurant.
import type { CollectionBrick, Json } from '@lupinum/ginko'
import type { Schema } from '@lupinum/ginko/internal'
import type { FunctionReturnType } from 'convex/server'
import type { api } from '#convex/api'
import type { Task } from './content'

/** One row of the person's unsaved input that this browser kept (useLocalDraftRows reads them). */
export interface LocalDraftRow {
  /** The draft's target: an entry id, `new:<brick>` or `task:<brick>.<task>`. */
  key: string
  /** "„title“ · time", or "area: new entry · time". */
  text: string
  /** The same without the time: "„title“", or "area: new entry". */
  label: string
  name: string
  area: string
  time: string
  /** Where the input was typed: an entry or a new entry in Content… */
  to?: string
  /** …or a create task's sheet. */
  task?: { brick: string; task: Task }
}

/** One of the person's own proposals as proposals.mine returns it. */
export type OwnRow = FunctionReturnType<typeof api.proposals.mine>['open'][number]

/** A section's tasks: the visible buttons, in schema order, and the rare ones behind "⋯". */
export interface Split { buttons: Task[]; more: Task[] }

/**
 * The brick whose card a plan brick `key` sits in: the single a collection `plans` (lunchPlans → lunch), or the single
 * whose hours status follows this collection (`status: { hours: { plans: key } }`, hourPlans → hours).
 */
export function planOwner(schema: Schema, key: string): string | undefined {
  const brick = schema.bricks[key]
  if (brick?.kind === 'collection' && brick.plans) return brick.plans.brick
  return Object.entries(schema.bricks).find(([, b]) => b.kind === 'single' && typeof b.status?.hours === 'object' && b.status.hours.plans === key)?.[0]
}

/**
 * Buttons and "⋯" of one section. A remove task goes on the rows when the timed list has them (`removeOnRows`, at most
 * 10 real rows), else into "⋯". A plan section merged into its owner's card shows only its first task as a button.
 */
export function taskSplit(tasks: readonly Task[], o: { plan: boolean; removeOnRows: boolean }): Split {
  const nonRemove = tasks.filter((t) => t.kind !== 'remove')
  const removes = o.removeOnRows ? [] : tasks.filter((t) => t.kind === 'remove')
  return o.plan ? { buttons: nonRemove.slice(0, 1), more: [...nonRemove.slice(1), ...removes] } : { buttons: nonRemove, more: removes }
}

/** The splits of one card's sections: a card without any button (staff with only a remove task) shows its "⋯" tasks as buttons. */
export function cardSplit(parts: readonly Split[]): Split[] {
  return parts.some((p) => p.buttons.length) ? [...parts] : parts.map((p) => ({ buttons: p.more, more: [] }))
}

/** A brick with tasks the person may do, in schema order, and whether its timed rows carry "Entfernen". */
export interface Part { key: string; tasks: readonly Task[]; removeOnRows: boolean }
/** A card of the grid: its main section first, then the plan sections merged into it. */
export interface CardLayout { key: string; sections: { key: string; plan: boolean; split: Split }[] }

/**
 * The cards of Today, schema order: a plan brick sits in its owner's card when the person has that card too, else it
 * is a card of its own.
 */
export function cardsOf(schema: Schema, parts: readonly Part[]): CardLayout[] {
  const shown = new Set(parts.map((p) => p.key))
  const ownerOf = (key: string) => { const o = planOwner(schema, key); return o && shown.has(o) ? o : undefined }
  return parts.filter((p) => !ownerOf(p.key)).map((main) => {
    const card = [main, ...parts.filter((p) => ownerOf(p.key) === main.key)]
    const splits = cardSplit(card.map((p) => taskSplit(p.tasks, { plan: p !== main, removeOnRows: p.removeOnRows })))
    return { key: main.key, sections: card.map((p, i) => ({ key: p.key, plan: p !== main, split: splits[i]! })) }
  })
}

/** One tile of "Wartet auf dich", in rank order. */
export type WaitingItem =
  | { kind: 'rejected'; key: string; p: OwnRow; fix: Task | undefined }
  | { kind: 'review'; count: number }
  | { kind: 'unsaved'; row: LocalDraftRow }
  | { kind: 'notLive'; key: string; p: OwnRow }

const WEEK_MS = 7 * 24 * 60 * 60 * 1000

/**
 * "Wartet auf dich": rejected own proposals (newest decision first), the review count for managers, unsaved input
 * (newest first, as given), then planned changes that did not go live in the last 7 days (newest first). The caller
 * passes only proposals of sections on Today.
 */
export function waitingOf(i: {
  manager: boolean
  review?: number
  rejected: readonly { key: string; p: OwnRow; fix?: Task }[]
  unsaved: readonly LocalDraftRow[]
  notLive: readonly { key: string; p: OwnRow }[]
  now: number
}): WaitingItem[] {
  const newest = <T extends { p: OwnRow }>(rows: readonly T[], at: (p: OwnRow) => number) => rows.toSorted((a, b) => at(b.p) - at(a.p))
  const decided = (p: OwnRow) => p.decidedAt ?? p.at ?? 0
  return [
    ...newest(i.rejected, (p) => p.decidedAt ?? 0).map((r): WaitingItem => ({ kind: 'rejected', key: r.key, p: r.p, fix: r.fix })),
    ...(i.manager && i.review ? [{ kind: 'review', count: i.review } as const] : []),
    ...i.unsaved.map((row): WaitingItem => ({ kind: 'unsaved', row })),
    ...newest(i.notLive.filter((r) => decided(r.p) >= i.now - WEEK_MS), decided).map((r): WaitingItem => ({ kind: 'notLive', key: r.key, p: r.p })),
  ]
}

/** What the verdict counts: each tile that is work (a not-live change is information) and each due area. */
export function verdictCount(items: readonly WaitingItem[], dueKeys: readonly string[]): number {
  return items.filter((x) => x.kind !== 'notLive').length + dueKeys.length
}

/** The yes/no fields a row marks with a badge ("Ausgebucht"): set on the entry and changed by an edit task the person holds. */
export function rowFlags(brick: CollectionBrick, tasks: readonly Task[], data: Record<string, Json>): string[] {
  const edited = new Set(tasks.flatMap((t) => (t.kind === 'edit' ? t.fields : [])))
  return Object.entries(brick.fields).filter(([key, field]) => field.type === 'boolean' && edited.has(key) && data[key] === true).map(([key]) => key)
}
