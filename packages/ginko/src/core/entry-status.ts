// One status for an entry (design V2 5.13 part 1): what visitors see now, and what waits. Every reader (the platform's
// lists and editor, the Studio, later Changes, the agent door and `ginko diff`) asks this function, so they cannot
// disagree. It returns data; the reader words it in its own language.
import { shownOn, shownUntil } from './resolve.ts'
import { wallClockIn, zonedDateTime } from './time.ts'
import type { Brick, Json } from './types.ts'

/** A moment in ms since the epoch. */
export type Time = number
/** A day, `YYYY-MM-DD`, in the site's time zone. */
export type Day = string

/** Why a plan did not go online: a link that leads nowhere, fields that fail the full check, or an import after its time. */
export type StopReason = { code: 'link'; href: string } | { code: 'invalid'; fields: string[] } | { code: 'late' }

/** One thing that waits. `by` is a user id; a file entry and an imported plan have no person. */
export type Waiting =
  | { kind: 'planned'; at: Time; by?: string }
  | { kind: 'stopped'; at: Time; by?: string; reason: StopReason }
  | { kind: 'unpublished'; by?: string; since: Time }
  | { kind: 'change'; from: Day; until?: Day; yearly?: true; name?: string; fields: string[]; by?: string }
  | { kind: 'request'; id: string; op: 'publish' | 'unpublish' | 'save' | 'add' | 'remove'; by?: string; at?: Time; from?: Day; group?: string }
  | { kind: 'ends'; on: Day }

/** `ended`: it was online, and `showUntil` took it off the website. `waiting` is empty when nothing waits. */
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
}

/**
 * The status of `entry` of `brick` on `today` (the site's day). This slice gives the waiting kinds `planned`, `stopped`,
 * `unpublished` and `ends`; `change` and `request` are in the type and come later. A draft has at most one of
 * `planned` and `stopped`.
 */
export function statusOf(brick: Brick, entry: StatusInput, today: Day): EntryStatus {
  const waiting: Waiting[] = []
  if (entry.state === 'draft') {
    if (entry.publishAt !== undefined) waiting.push({ kind: 'planned', at: entry.publishAt, ...(entry.publishBy ? { by: entry.publishBy } : {}) })
    else if (entry.stopped) waiting.push({ kind: 'stopped', at: entry.stopped.at, ...(entry.stopped.by ? { by: entry.stopped.by } : {}), reason: entry.stopped.reason })
    return { now: 'draft', waiting }
  }
  if (!shownOn(brick, entry.data, today)) return { now: 'ended', waiting }
  if (entry.unpublished) waiting.push({ kind: 'unpublished', ...(entry.unpublished.by ? { by: entry.unpublished.by } : {}), since: entry.unpublished.since })
  const on = shownUntil(brick, entry.data)
  if (on !== undefined) waiting.push({ kind: 'ends', on })
  return { now: 'online', waiting }
}

/**
 * The `statusOf` input of a file entry: `$draft: true` is a draft; a `$publishAt` (a day, or a day and time, on the
 * site's wall clock) still to come at `now` is a planned draft; any other entry is online.
 */
export function fileStatusInput(dollar: { $draft?: boolean; $publishAt?: string }, data: StatusInput['data'], timeZone: string, now: Date = new Date()): StatusInput {
  if (dollar.$draft === true) return { data, state: 'draft' }
  const at = dollar.$publishAt
  if (at === undefined) return { data, state: 'live' }
  const [day, time = '00:00'] = at.split('T') as [string, string?]
  if (`${day}T${time}` <= wallClockIn(timeZone, now)) return { data, state: 'live' }
  return { data, state: 'draft', publishAt: Date.parse(zonedDateTime(day, time, timeZone)) }
}
