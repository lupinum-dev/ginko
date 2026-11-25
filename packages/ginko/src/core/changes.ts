// A dated change (D117): fields of an entry that take new values from a day on, "a new price from 1 November". One
// type for both homes (`$changes` in a file, a stored row on the platform), one function that applies them, one check.
import { isTranslatable, slugKeyOf } from './fields.ts'
import { labelOf } from './labels.ts'
import { bare, DEFAULT_LOCALE, msg, type CoreKey, type Msg } from './messages.ts'
import { treeFields } from './outline.ts'
import { addDays } from './time.ts'
import { isDate, validate, type ValidateOptions } from './validate.ts'
import type { Day } from './entry-status.ts'
import type { Brick, Field, Issue, Json, Schema } from './types.ts'

/**
 * Fields that take new values from the first minute of `from` (a day in the site's zone). Without `until` the values
 * hold for good (a new normal value). With `until` the change is an exception: its values lie over the normal values
 * from `from` to the last minute of `until` and are never written into the entry; with overlaps the later `from` wins.
 * `set` holds whole fields in storage format (a list is one field); `null` clears an optional field.
 *
 * A change with an end may carry two more keys (slice 4): `yearly: true`, its days come back every year (`from` and
 * `until` are the days of its first time, `occurrence` gives the others); `name`, a plain text of 1 to `NAME_MAX`
 * characters that labels it in the Studio, the history and for a page. It is not translated.
 */
export interface Change { from: Day; until?: Day; yearly?: true; name?: string; set: Record<string, Json> }

/** The longest name of a change, in characters. */
export const NAME_MAX = 60

/** One time of a change: its first and its last day. */
export interface Time { from: Day; until: Day }

/** At most this many changes wait for an entry (the platform's save and import, D125, D128); both kinds count. */
export const MAX_DATED = 20

/** `a` before `b` by their days; changes of one day keep their order. */
const byDay = (a: Change, b: Change) => (a.from < b.from ? -1 : a.from > b.from ? 1 : 0)

/** A change with an end. */
export const isException = (change: Change): change is Change & { until: Day } => change.until !== undefined

const isLeap = (year: number) => (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
/** The first day of `year` on or after month and day `md` (`MM-DD`): 29 February is 1 March in a year without it. */
const firstOnOrAfter = (year: number, md: string): Day => (md === '02-29' && !isLeap(year) ? `${year}-03-01` : `${year}-${md}`)
/** The last day of `year` on or before month and day `md`: 29 February is 28 February in a year without it. */
const lastOnOrBefore = (year: number, md: string): Day => (md === '02-29' && !isLeap(year) ? `${year}-02-28` : `${year}-${md}`)

/**
 * The one time of `change` that holds on `day` or comes next after it, as two real days; undefined for a change without
 * an end and for a one-off change that has ended. The one place a yearly change becomes days: month and day are
 * compared as text (`MM-DD`), so a range may cross the turn of the year, and 29 February as `from` means 1 March in a
 * year without it, as `until` the end of February. A yearly change never holds before its `from`.
 */
export function occurrence(change: Change, day: Day): Time | undefined {
  if (change.until === undefined) return undefined
  const first = { from: change.from, until: change.until }
  if (day <= change.from) return first
  if (!change.yearly) return change.until >= day ? first : undefined
  const [from, until] = [change.from.slice(5), change.until.slice(5)]
  const year = Number(day.slice(0, 4))
  for (const y of [year - 1, year, year + 1]) {
    const time = { from: firstOnOrAfter(y, from), until: lastOnOrBefore(until < from ? y + 1 : y, until) }
    if (time.from >= change.from && time.until >= day) return time
  }
  return undefined
}

/**
 * A yearly change whose days are a year long or longer: it would never end, so it could not start again. Its `until`
 * reaches the day before its start of the next year (29 February starts on 1 March in a year without it).
 */
export function yearTooLong(change: Change & { until: Day }): boolean {
  const nextStart = firstOnOrAfter(Number(change.from.slice(0, 4)) + 1, change.from.slice(5))
  return change.until >= addDays(nextStart, -1)
}

/**
 * A yearly change on 29 February alone: that day exists every fourth year only, so in the other years its time would
 * end before it starts. As one bound of longer days 29 February is fine (it moves to 1 March or 28 February).
 */
export function leapDayAlone(change: Change & { until: Day }): boolean {
  return change.from.endsWith('-02-29') && change.until === change.from
}

/** The days a change starts on, from its first up to `last` (a yearly one: each year's start). */
function startsUpTo(change: Change, last: Day): Day[] {
  if (!change.yearly) return [change.from]
  const out: Day[] = []
  for (let time = occurrence(change, change.from); time && time.from <= last; time = occurrence(change, addDays(time.until, 1))) out.push(time.from)
  return out
}

/** The last day any of `changes` names (its first `from` or `until`). */
function lastNamed(changes: readonly Change[]): Day {
  let last = '0000-01-01'
  for (const c of changes) for (const day of [c.from, c.until]) if (day !== undefined && day > last) last = day
  return last
}

/** A year after the last day `changes` name: by then every yearly change has come once with all the others in place. */
const horizonOf = (changes: readonly Change[]): Day => addDays(lastNamed(changes), 366)

/**
 * The first day on which a time of `change` starts together with a time of one of the exceptions `others` and both set
 * one field (which would win?): that day, the field and the other exception. Checked at each start of `change` up to
 * `horizon`, by default a year after the last day any of them names. The file check and the platform's save use it.
 */
export function startTie<C extends Change>(change: Change & { until: Day }, others: readonly C[], horizon: Day = horizonOf([change, ...others])): { day: Day; field: string; other: C } | undefined {
  for (const start of startsUpTo(change, horizon)) {
    for (const other of others) {
      if (!isException(other) || occurrence(other, start)?.from !== start) continue
      const field = Object.keys(change.set).find((name) => Object.hasOwn(other.set, name))
      if (field) return { day: start, field, other }
    }
  }
  return undefined
}

/**
 * The exceptions that hold on `day`, each with the days of the time that holds, in the order of those times' starts
 * (the last one wins where they overlap).
 */
export function holdingOn(changes: readonly Change[] | undefined, day: Day): { change: Change & { until: Day }; time: Time }[] {
  return (changes ?? []).filter(isException).flatMap((change) => {
    const time = occurrence(change, day)
    return time && time.from <= day ? [{ change, time }] : []
  }).sort((a, b) => (a.time.from < b.time.from ? -1 : a.time.from > b.time.from ? 1 : 0))
}

/**
 * The days on which an entry's values with `changes` can be largest, for the budget check (round L5): after its last
 * change, every first day of a change (an exception lies over the values of its days only), the day after each
 * exception's end (the values it covered come back), and for a yearly change its first day after all the others.
 */
export function sizeDays(changes: readonly Change[] | undefined): Day[] {
  const days = new Set<Day>(['9999-12-31'])
  const last = lastNamed(changes ?? [])
  for (const change of changes ?? []) {
    days.add(change.from)
    if (isException(change)) days.add(addDays(change.until, 1))
    if (change.yearly) days.add(occurrence(change, last)!.from)
  }
  return [...days]
}

/**
 * The values of `day`: `data` (stored form) with every change without an end whose `from` is at or before `day`
 * applied in the order of their days, then the exceptions that hold on `day` laid over them in the order of the starts
 * of their times. The one place a change is applied (D118): the file reader with the build's day, the platform's run
 * on the day and its read, and the check.
 */
export function dataOn(data: Record<string, Json>, changes: readonly Change[] | undefined, day: Day): Record<string, Json> {
  const due = [...(changes ?? []).filter((c) => !isException(c) && c.from <= day).sort(byDay), ...holdingOn(changes, day).map((h) => h.change)]
  if (!due.length) return data
  const out = { ...data }
  for (const change of due) {
    for (const [field, value] of Object.entries(change.set)) {
      if (value === null) delete out[field]
      else out[field] = value
    }
  }
  return out
}

/**
 * The changes whose next start is still ahead of `day`, each with the days of that time (an exception) or its day, in
 * the order of those starts. A yearly change that does not hold waits for its next time.
 */
export function waitingChanges(changes: readonly Change[] | undefined, day: Day): { change: Change; from: Day; until?: Day }[] {
  return (changes ?? []).flatMap((change) => {
    const time = isException(change) ? occurrence(change, day) : { from: change.from }
    return time && time.from > day ? [{ change, ...time }] : []
  }).sort((a, b) => (a.from < b.from ? -1 : a.from > b.from ? 1 : 0))
}

/**
 * The changes that still matter on `day`, in the order of their days: those without an end still ahead (the others are
 * written into the entry), the exceptions that hold or wait (one that ended changes nothing any more), and every
 * yearly change (it comes back). What a file entry keeps beside its values, and what an import keeps as rows; each
 * counts toward `MAX_DATED`.
 */
export function keptChanges(changes: readonly Change[] | undefined, day: Day): Change[] {
  return (changes ?? []).filter((c) => (c.yearly || (isException(c) ? c.until >= day : c.from > day))).sort(byDay)
}

/**
 * The live fields of a brick that a change may never set (D119): the fields that say when an entry shows
 * (`publishedOn`, `showUntil`, the week of `plans`) or where (the slug, the fields of a navigation tree). They cannot
 * themselves depend on a day.
 */
export function fixedFields(brick: Brick): Set<string> {
  const out = new Set<string>()
  const slug = slugKeyOf(brick)
  if (slug) out.add(slug)
  if (brick.kind === 'collection') {
    if (brick.publishedOn) out.add(brick.publishedOn)
    if (brick.showUntil) out.add(brick.showUntil.field)
    if (brick.plans) out.add(brick.plans.field)
    if (brick.tree) for (const name of treeFields(brick.tree)) out.add(name)
  }
  return out
}

/** A field that holds text per language somewhere inside: a translatable field, an image (its `alt`), a list or rows with one. */
export function hasTranslatablePart(field: Field): boolean {
  if (isTranslatable(field) || field.type === 'image') return true
  if (field.type === 'list' || field.type === 'rows') return Object.values(field.of).some((sub) => !sub.retired && hasTranslatablePart(sub))
  return false
}

/**
 * Why `name` of `brick` may not be in a change, as a catalog key, or undefined when it may: not a live field, a field
 * that says when or where (`fixedFields`), or on a site with several languages a field with text per language (a
 * translated value in a change is not built yet).
 */
export function changeRefusal(schema: Pick<Schema, 'locales'>, brick: Brick, name: string): 'unknownField' | 'changeFixed' | 'changeTranslated' | undefined {
  const field = Object.hasOwn(brick.fields, name) ? brick.fields[name] : undefined
  if (!field || field.retired) return 'unknownField'
  if (fixedFields(brick).has(name)) return 'changeFixed'
  if (schema.locales.length > 1 && hasTranslatablePart(field)) return 'changeTranslated'
  return undefined
}

/**
 * An issue of one change: `change` is its index in the list that was checked; `from` is the day whose values have the
 * problem (absent for a change that is not well formed), so two runs over different lists can be compared.
 */
export type ChangeIssue = Issue & { change: number; from?: Day }

/**
 * The check of an entry's changes (D119), for `ginko check`, the file reader and the platform: `changes` is a list;
 * each change has a day in `from` and at least one field in `set`, maybe an end in `until`, and with an end `yearly:
 * true` (shorter than a year) and a `name`, and no other key; each field is one a change may set (`changeRefusal`); an
 * entry has at most one change without an end per day, and two exceptions whose times start on one day do not set one
 * field; and each day's changes are checked like a save of their fields on that day, plus what that day newly breaks
 * elsewhere (a yearly change on each of its days up to a year after the last day any change names).
 * With the days in order and S_k the entry after day k's changes (S_0 = `data`): the errors of a patch of S_k that
 * changes the fields of day k (a rule across fields counts when the day sets one of its fields), and the errors of a
 * strict check of S_k that S_(k-1) did not have (a required field that a change shows through its `showWhen`). A
 * problem the entry already had elsewhere is not the change's. Each problem goes to the change of that day that sets
 * its field, else to the day's last change, once per path and code. `data` is the entry's stored data; `options` are
 * passed to `validate` (references, files). Only errors.
 */
export async function changeIssues(schema: Schema, brickKey: string, data: Record<string, Json>, changes: unknown, options: Omit<ValidateOptions, 'mode' | 'changed'> = {}): Promise<ChangeIssue[]> {
  const brick = Object.hasOwn(schema.bricks, brickKey) ? schema.bricks[brickKey] : undefined
  if (!brick) return []
  const main = schema.locales[0] ?? DEFAULT_LOCALE
  const out: ChangeIssue[] = []
  const add = (change: number, path: string, code: string, key: CoreKey, params?: Msg['params']) => out.push({ path, code, change, ...msg(key, params) })
  if (!Array.isArray(changes)) {
    add(-1, '$changes', 'CHANGE', 'issues.changesList')
    return out
  }
  const good: { index: number; change: Change }[] = []
  const dayTaken = new Set<string>()
  // Two exceptions whose times start on one day may not set one field (which wins?): checked against the exceptions
  // before, at each start of this one up to a year after the last day any change names.
  const horizon = horizonOf(changes.filter((c): c is Change => isRecord(c) && isDate(c.from) && (c.until === undefined || isDate(c.until))))
  changes.forEach((raw: unknown, index) => {
    const at = `$changes.${index}`
    if (!isRecord(raw)) return add(index, at, 'CHANGE', 'issues.changeShape')
    let ok = true
    for (const key of Object.keys(raw)) {
      if (key === 'from' || key === 'until' || key === 'yearly' || key === 'name' || key === 'set') continue
      ok = false
      add(index, `${at}.${key}`, 'CHANGE', 'issues.changeKey', { key })
    }
    const ends = Object.hasOwn(raw, 'until')
    // Both keys belong to a change with an end; a name is one plain text of 1 to NAME_MAX characters, trimmed.
    if (Object.hasOwn(raw, 'yearly') && (raw.yearly !== true || !ends)) {
      ok = false
      add(index, `${at}.yearly`, 'CHANGE', 'issues.changeYearly')
    }
    if (Object.hasOwn(raw, 'name') && (!ends || typeof raw.name !== 'string' || !raw.name.trim() || raw.name.trim().length > NAME_MAX)) {
      ok = false
      add(index, `${at}.name`, 'CHANGE', 'issues.changeName')
    }
    if (ends && !isDate(raw.until)) {
      ok = false
      add(index, `${at}.until`, 'CHANGE', 'issues.changeUntilDay', { value: String(raw.until ?? '') })
    } else if (ends && isDate(raw.from) && (raw.until as string) < raw.from) {
      ok = false
      add(index, `${at}.until`, 'CHANGE', 'issues.changeUntilBefore', { until: raw.until as string, from: raw.from })
    } else if (ends && isDate(raw.from) && raw.yearly === true && yearTooLong({ from: raw.from, until: raw.until as Day, yearly: true, set: {} })) {
      ok = false
      add(index, `${at}.until`, 'CHANGE', 'issues.changeYearlyLong', { until: raw.until as string, from: raw.from })
    } else if (ends && isDate(raw.from) && raw.yearly === true && leapDayAlone({ from: raw.from, until: raw.until as Day, yearly: true, set: {} })) {
      ok = false
      add(index, `${at}.until`, 'CHANGE', 'issues.changeYearlyLeapDay')
    }
    const set = raw.set
    if (!isDate(raw.from)) {
      ok = false
      add(index, `${at}.from`, 'CHANGE', 'issues.changeDay', { value: String(raw.from ?? '') })
    } else if (ends) {
      const tie = ok && isRecord(set) ? startTie({ from: raw.from, until: raw.until as Day, ...(raw.yearly === true ? { yearly: true } : {}), set }, good.map((g) => g.change), horizon) : undefined
      if (tie) {
        ok = false
        const field = Object.hasOwn(brick.fields, tie.field) ? brick.fields[tie.field]! : undefined
        add(index, `${at}.from`, 'CHANGE', 'issues.changeSameStart', { day: tie.day, label: field ? labelOf(field.label, DEFAULT_LOCALE, main) : tie.field })
      }
    } else if (dayTaken.has(raw.from)) {
      // One change without an end per day and entry: the platform keeps one row per day, so two would merge into one
      // silently.
      ok = false
      add(index, `${at}.from`, 'CHANGE', 'issues.changeTwice', { day: raw.from })
    } else dayTaken.add(raw.from)
    if (!isRecord(set) || !Object.keys(set).length) {
      add(index, `${at}.set`, 'CHANGE', 'issues.changeEmpty')
      return
    }
    for (const name of Object.keys(set)) {
      const refusal = changeRefusal(schema, brick, name)
      if (refusal) {
        ok = false
        const field = Object.hasOwn(brick.fields, name) ? brick.fields[name]! : undefined
        add(index, name, refusal === 'unknownField' ? 'UNKNOWN_FIELD' : refusal === 'changeFixed' ? 'CHANGE' : 'NOT_YET', `issues.${refusal}`, field ? { label: labelOf(field.label, DEFAULT_LOCALE, main) } : undefined)
        continue
      }
    }
    if (ok) {
      good.push({ index, change: {
        from: raw.from as Day, ...(ends ? { until: raw.until as Day } : {}), ...(raw.yearly === true ? { yearly: true } : {}),
        ...(typeof raw.name === 'string' ? { name: raw.name.trim() } : {}), set: set as Record<string, Json>,
      } })
    }
  })
  // The entry on each day where something starts or an exception has ended, in the order of the days (`dataOn` of all
  // changes on that day): a later day builds on the values an earlier one left, the changes of one day count together
  // (one may show a field that the other fills), and the day after an exception's end shows what comes back. A yearly
  // change counts on each of its times up to the horizon.
  const strict = async (d: Record<string, Json>) => (await validate(schema, brickKey, d, { ...options, mode: 'create' })).errors
  const keyOf = (issue: Issue) => `${issue.path}\u0000${issue.code}`
  const all = good.map((g) => g.change)
  let known = new Set((await strict(data)).map(keyOf))
  const startsOn = (change: Change, day: Day) => (isException(change) ? occurrence(change, day)?.from === day : change.from === day)
  const endsBefore = (change: Change, day: Day) => isException(change) && occurrence(change, addDays(day, -1))?.until === addDays(day, -1)
  const days = [...new Set(good.flatMap(({ change }) => (isException(change)
    ? startsUpTo(change, horizon).flatMap((start) => [start, addDay(occurrence(change, start)!.until)])
    : [change.from])))].sort()
  for (const day of days) {
    const ofDay = good.filter((g) => startsOn(g.change, day))
    const current = dataOn(data, all, day)
    const changed = new Set(ofDay.flatMap((g) => Object.keys(g.change.set)))
    // A day where only exceptions end saves nothing new: its values are checked for what they newly break.
    const saved = changed.size ? (await validate(schema, brickKey, current, { ...options, mode: 'patch', changed })).errors : []
    const errors = await strict(current)
    const taken = new Set<string>()
    const ended = good.filter((g) => endsBefore(g.change, day))
    for (const problem of [...saved, ...errors.filter((e) => !known.has(keyOf(e)))]) {
      if (taken.has(keyOf(problem))) continue
      taken.add(keyOf(problem))
      const root = problem.path.split('.')[0]!
      const sets = (g: { change: Change }) => Object.hasOwn(g.change.set, root)
      // The change of the day that sets the field; else after an end the normal change that set it, or the exception
      // that ended; else the day's last change.
      const normal = good.filter((g) => !g.change.until && g.change.from <= day && sets(g)).at(-1)
      const owner = ofDay.find(sets) ?? ofDay.at(-1) ?? normal ?? ended.find(sets) ?? ended.at(-1)!
      out.push({ path: problem.path, code: problem.code, change: owner.index, from: day, ...msg('issues.changeValue', { day, problem: bare(problem) }) })
    }
    known = new Set(errors.map(keyOf))
  }
  return out
}

const addDay = (day: Day) => addDays(day, 1) as Day

function isRecord(value: unknown): value is Record<string, Json> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
