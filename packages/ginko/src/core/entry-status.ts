// One status for an entry (design V2 5.13 part 1): what visitors see now, and what waits. Every reader (the platform's
// lists and editor, the Studio, later Changes, the agent door and `ginko diff`) asks this function, so they cannot
// disagree. It returns data; the reader words it in its own language.
import { shownOn, shownUntil } from './resolve.ts'
import { dayStartIn, wallClockIn, zonedDateTime } from './time.ts'
import type { Brick, Json } from './types.ts'

/** A moment in ms since the epoch. */
export type Time = number
/** A day, `YYYY-MM-DD`, in the site's time zone. */
export type Day = string

/** Why a plan did not go online: a link that leads nowhere, fields that fail the full check, an import after its time, or an error of the run. */
export type StopReason = { code: 'link'; href: string } | { code: 'invalid'; fields: string[] } | { code: 'late' } | { code: 'failed' }

/** One thing that waits. `by` is a user id; a file entry and an imported plan have no person. */
export type Waiting =
  | { kind: 'planned'; at: Time; by?: string }
  | { kind: 'stopped'; at: Time; by?: string; reason: StopReason; change?: { from: Day; fields: string[] } }
  | { kind: 'unpublished'; by?: string; since: Time }
  | { kind: 'change'; from: Day; until?: Day; yearly?: true; name?: string; fields: string[]; by?: string }
  | { kind: 'request'; id: string; op: 'publish' | 'unpublish' | 'save' | 'add' | 'remove'; by?: string; at?: Time; from?: Day; group?: string }
  | { kind: 'ends'; on: Day }

/**
 * `ended`: it was online, and `showUntil` took it off the website. `now` and `waiting` are independent (spec 5.13.1):
 * an ended entry can still have unpublished changes. `waiting` is empty when nothing waits.
 */
export interface EntryStatus {
  now: 'online' | 'draft' | 'ended'
  waiting: Waiting[]
}

/** What `statusOf` reads of an entry, the same for a platform row and a file entry (`fileStatusInput`). */
export interface StatusInput {
  data: Record<string, Json | undefined>
  state: 'draft' | 'live'
  publishAt?: Time
  publishBy?: string
  stopped?: { at: Time; by?: string; reason: StopReason }
  /** Saved changes of an online entry that are not on the website yet. */
  unpublished?: { by?: string; since: Time }
  /** The entry's dated changes still to come (D117), waiting or stopped on their day (`stopped`, D103 reasons). */
  changes?: readonly { from: Day; fields: string[]; by?: string; stopped?: { at: Time; reason: StopReason } }[]
}

/**
 * The status of `entry` of `brick` on `today` (the site's day). This slice gives the waiting kinds `planned`, `stopped`,
 * `unpublished`, `change` and `ends`; `request` is in the type and comes later. A draft has at most one of `planned`
 * and `stopped` of its own. The dated changes follow in the order of their days, in every state (D124): a waiting one
 * as `change`, one that stopped on its day as `stopped` with the `change` it was.
 */
export function statusOf(brick: Brick, entry: StatusInput, today: Day): EntryStatus {
  const waiting: Waiting[] = []
  if (entry.state === 'draft') {
    if (entry.publishAt !== undefined) waiting.push({ kind: 'planned', at: entry.publishAt, ...(entry.publishBy ? { by: entry.publishBy } : {}) })
    else if (entry.stopped) waiting.push({ kind: 'stopped', at: entry.stopped.at, ...(entry.stopped.by ? { by: entry.stopped.by } : {}), reason: entry.stopped.reason })
    waiting.push(...changesOf(entry))
    return { now: 'draft', waiting }
  }
  if (entry.unpublished) waiting.push({ kind: 'unpublished', ...(entry.unpublished.by ? { by: entry.unpublished.by } : {}), since: entry.unpublished.since })
  waiting.push(...changesOf(entry))
  if (!shownOn(brick, entry.data, today)) return { now: 'ended', waiting }
  const on = shownUntil(brick, entry.data)
  if (on !== undefined) waiting.push({ kind: 'ends', on })
  return { now: 'online', waiting }
}

/** The dated changes of `entry` as waiting things, in the order of their days. */
function changesOf(entry: StatusInput): Waiting[] {
  return [...(entry.changes ?? [])].sort((a, b) => (a.from < b.from ? -1 : a.from > b.from ? 1 : 0)).map((c): Waiting => {
    const by = c.by ? { by: c.by } : {}
    return c.stopped
      ? { kind: 'stopped', at: c.stopped.at, ...by, reason: c.stopped.reason, change: { from: c.from, fields: [...c.fields] } }
      : { kind: 'change', from: c.from, fields: [...c.fields], ...by }
  })
}

/**
 * The `statusOf` input of a file entry: `$draft: true` is a draft; a `$publishAt` (a day, or a day and time, on the
 * site's wall clock) still to come at `now` is a planned draft; any other entry is online.
 */
export function fileStatusInput(dollar: { $draft?: boolean; $publishAt?: string }, data: StatusInput['data'], timeZone: string, now: Date = new Date()): StatusInput {
  if (dollar.$draft === true) return { data, state: 'draft' }
  const at = dollar.$publishAt
  if (at === undefined) return { data, state: 'live' }
  const [day, time] = at.split('T') as [string, string?]
  if (`${day}T${time ?? '00:00'}` <= wallClockIn(timeZone, now)) return { data, state: 'live' }
  // A day alone is its first instant, which is not 00:00 where the clock jumps at midnight (Havana, G6).
  return { data, state: 'draft', publishAt: time === undefined ? dayStartIn(day, timeZone) : Date.parse(zonedDateTime(day, time, timeZone)) }
}
