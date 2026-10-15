// What the history says about a change or a proposal, stored as a catalog key plus params (`msg`), so
// each team member reads it in their own Studio language and dates in the site's time zone. Next to it
// the row keeps `sentence`, the German rendering, as the fallback for rows written before `msg`.
import type { Label } from '@lupinum/ginko'
import { labelOf, stableJson, type Schema } from '@lupinum/ginko/internal'
import type { Doc } from '../_generated/dataModel'
import { storedSentence } from './input'
import { t, type MessageKey } from './i18n'

/** A value in a message: text, a number (a date is milliseconds), a label per locale, or another message. */
export type Param = string | number | Label | HistoryMsg

/** A type, not an interface, so it counts as `Json` where a mutation returns it. */
export type HistoryMsg = {
  /** A key of the server catalog (`history.*`, `publicness.*`). */
  key: string
  params?: Record<string, Param>
}

/** A message with its German rendering: what a change or proposal row stores. */
export interface Recorded {
  msg: HistoryMsg
  sentence: string
}

/** The site facts a message needs: the main language (labels fall back to it) and the zone of its dates. */
type Where = Pick<Schema, 'locales' | 'timeZone'>

/** The key is checked against the catalog where a message is built. */
export const msg = (key: MessageKey, params?: Record<string, Param>): HistoryMsg => (params ? { key, params } : { key })

const isMsg = (value: Param): value is HistoryMsg =>
  typeof value === 'object' && typeof value.key === 'string' && Object.keys(value).every((k) => k === 'key' || k === 'params')

const HOUR = 3_600_000
const walls = new Map<string, Intl.DateTimeFormat>()
const wall = (ms: number, timeZone: string) => {
  let reader = walls.get(timeZone)
  if (!reader) walls.set(timeZone, reader = new Intl.DateTimeFormat('en-US', { timeZone, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric' }))
  return reader.format(ms)
}

/**
 * Whether the clock in `timeZone` shows the time of `ms` twice: the hour the clocks go back. The catalog's
 * `{twice, select, yes …}` then adds the zone's short name ("02:30 MEZ"); the Studio's `textOf` follows the same rule.
 */
const twiceOnClock = (ms: number, timeZone: string) => [ms - HOUR, ms + HOUR].some((other) => wall(other, timeZone) === wall(ms, timeZone))

/** The text of a message in `locale`: nested messages first, labels in `locale` (else the main language), dates in the site's zone. */
export function historyText(message: HistoryMsg, locale: string, where: Where | undefined): string {
  const main = where?.locales[0] ?? 'de'
  const timeZone = where?.timeZone ?? 'UTC'
  const params = Object.fromEntries(Object.entries(message.params ?? {}).map(([name, value]) => [
    name,
    typeof value === 'string' || typeof value === 'number' ? value : isMsg(value) ? historyText(value, locale, where) : labelOf(value, locale, main),
  ]))
  if (typeof params.at === 'number' && twiceOnClock(params.at, timeZone)) params.twice = 'yes'
  return t(locale, message.key as MessageKey, params, { timeZone })
}

/** The row fields `msg` and `sentence` (German, cut to the stored length) for a message. */
export function recorded(message: HistoryMsg, where?: Where): Recorded {
  return { msg: message, sentence: storedSentence(historyText(message, 'de', where)) }
}

/**
 * Why a save can no longer be undone: undone already, its entry removed, a field changed since (another value or other
 * prints than the save left, see asSaved), or the fields restructured since.
 */
export type UndoBlock = 'undone' | 'removed' | 'changed' | 'schema'

/** The prints of the leaves under `root`, as one comparable text. */
const printsUnder = (prints: Record<string, unknown> | undefined, root: string) =>
  stableJson(Object.fromEntries(Object.entries(prints ?? {}).filter(([leaf]) => leaf === root || leaf.startsWith(`${root}.`))))

/**
 * Whether a field of the entry is still as the save left it. A later write of the field (its revision moved on) counts
 * only when it left another value or other prints: after the newer save is undone, the older one is undoable again,
 * while a later "Passt so" (prints only) still blocks it. An absent value and null compare equal (stableJson).
 */
function asSaved(change: Pick<Doc<'changes'>, 'entryRev' | 'after' | 'printsAfter'>, entry: Pick<Doc<'entries'>, 'fieldRevs' | 'data' | 'prints'>, root: string) {
  if (entry.fieldRevs[root] === change.entryRev) return true
  const after: Record<string, unknown> | undefined = change.after
  const data: Record<string, unknown> = entry.data
  return !!after && stableJson(data[root]) === stableJson(after[root]) && printsUnder(entry.prints, root) === printsUnder(change.printsAfter, root)
}

/**
 * The one rule for "can this save still be undone": the undo mutation refuses with it, and the
 * history list shows it, so the list never offers an undo the server refuses. `migrated` are the
 * site's applied migrations. A full validation of the old values stays a refusal at undo time.
 */
export function undoBlockOf(
  change: Pick<Doc<'changes'>, 'undoneBy' | 'fields' | 'entryRev' | 'at' | 'after' | 'printsAfter'>,
  entry: Pick<Doc<'entries'>, 'deletedAt' | 'fieldRevs' | 'brick' | 'data' | 'prints'> | null,
  migrated: Pick<Doc<'migrationsApplied'>, 'brick' | '_creationTime'>[],
): UndoBlock | undefined {
  if (change.undoneBy) return 'undone'
  if (!entry || entry.deletedAt) return 'removed'
  if ((change.fields ?? []).some((root) => !asSaved(change, entry, root))) return 'changed'
  if (migrated.some((m) => m.brick === entry.brick && m._creationTime > change.at)) return 'schema'
  return undefined
}
