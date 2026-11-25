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
 */
export interface Change { from: Day; until?: Day; set: Record<string, Json> }

/** The keys a change will have later (a yearly one, a named one); refused as "not built yet". */
const LATER_KEYS = ['yearly', 'name']

/** At most this many changes wait for an entry (the platform's save and import, D125, D128); both kinds count. */
export const MAX_DATED = 20

/** `a` before `b` by their days; changes of one day keep their order. */
const byDay = (a: Change, b: Change) => (a.from < b.from ? -1 : a.from > b.from ? 1 : 0)

/** A change with an end. */
export const isException = (change: Change): change is Change & { until: Day } => change.until !== undefined

/** The exceptions that hold on `day`, in the order of their starts (the last one wins where they overlap). */
export function holdingOn(changes: readonly Change[] | undefined, day: Day): (Change & { until: Day })[] {
  return (changes ?? []).filter(isException).filter((c) => c.from <= day && day <= c.until).sort(byDay)
}

/**
 * The days on which an entry's values with `changes` can be largest, for the budget check (round L5): after its last
 * change, every first day of a change (an exception lies over the values of its days only), and the day after each
 * exception's end (the values it covered come back).
 */
export function sizeDays(changes: readonly Change[] | undefined): Day[] {
  const days = new Set<Day>(['9999-12-31'])
  for (const change of changes ?? []) {
    days.add(change.from)
    if (isException(change)) days.add(addDays(change.until, 1))
  }
  return [...days]
}

/**
 * The values of `day`: `data` (stored form) with every change without an end whose `from` is at or before `day`
 * applied in the order of their days, then the exceptions that hold on `day` laid over them in the order of their
 * starts. The one place a change is applied (D118): the file reader with the build's day, the platform's run on the
 * day and its read, and the check.
 */
export function dataOn(data: Record<string, Json>, changes: readonly Change[] | undefined, day: Day): Record<string, Json> {
  const due = [...(changes ?? []).filter((c) => !isException(c) && c.from <= day).sort(byDay), ...holdingOn(changes, day)]
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

/** The changes whose day is still ahead of `day`, in the order of their days. */
export function waitingChanges(changes: readonly Change[] | undefined, day: Day): Change[] {
  return (changes ?? []).filter((c) => c.from > day).sort(byDay)
}

/**
 * The changes that still matter on `day`, in the order of their days: those without an end still ahead (the others are
 * written into the entry) and the exceptions that hold or wait (one that ended changes nothing any more). What a file
 * entry keeps beside its values, and what an import keeps as rows; each counts toward `MAX_DATED`.
 */
export function keptChanges(changes: readonly Change[] | undefined, day: Day): Change[] {
  return (changes ?? []).filter((c) => (isException(c) ? c.until >= day : c.from > day)).sort(byDay)
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
 * each change has a day in `from` and at least one field in `set`, and no other key (`until`, `yearly` and `name` are
 * not built yet); each field is one a change may set (`changeRefusal`); an entry has at most one change per day; and
 * each day's changes are checked like a save of their fields on that day, plus what that day newly breaks elsewhere.
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
  // The fields that exceptions starting on a day set: two exceptions of one start may not set one field (which wins?).
  const startTaken = new Map<string, Set<string>>()
  changes.forEach((raw: unknown, index) => {
    const at = `$changes.${index}`
    if (!isRecord(raw)) return add(index, at, 'CHANGE', 'issues.changeShape')
    let ok = true
    for (const key of Object.keys(raw)) {
      if (key === 'from' || key === 'until' || key === 'set') continue
      ok = false
      if (LATER_KEYS.includes(key)) add(index, `${at}.${key}`, 'NOT_YET', 'issues.changeNotYet', { key })
      else add(index, `${at}.${key}`, 'CHANGE', 'issues.changeKey', { key })
    }
    const ends = Object.hasOwn(raw, 'until')
    if (ends && !isDate(raw.until)) {
      ok = false
      add(index, `${at}.until`, 'CHANGE', 'issues.changeUntilDay', { value: String(raw.until ?? '') })
    } else if (ends && isDate(raw.from) && (raw.until as string) < raw.from) {
      ok = false
      add(index, `${at}.until`, 'CHANGE', 'issues.changeUntilBefore', { until: raw.until as string, from: raw.from })
    }
    const set = raw.set
    if (!isDate(raw.from)) {
      ok = false
      add(index, `${at}.from`, 'CHANGE', 'issues.changeDay', { value: String(raw.from ?? '') })
    } else if (ends) {
      const taken = startTaken.get(raw.from) ?? new Set<string>()
      const twice = isRecord(set) ? Object.keys(set).find((name) => taken.has(name)) : undefined
      if (twice) {
        ok = false
        const field = Object.hasOwn(brick.fields, twice) ? brick.fields[twice]! : undefined
        add(index, `${at}.from`, 'CHANGE', 'issues.changeSameStart', { day: raw.from, label: field ? labelOf(field.label, DEFAULT_LOCALE, main) : twice })
      }
      if (isRecord(set)) for (const name of Object.keys(set)) taken.add(name)
      startTaken.set(raw.from, taken)
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
    if (ok) good.push({ index, change: { from: raw.from as Day, ...(ends ? { until: raw.until as Day } : {}), set: set as Record<string, Json> } })
  })
  // The entry on each day where something starts or an exception has ended, in the order of the days (`dataOn` of all
  // changes on that day): a later day builds on the values an earlier one left, the changes of one day count together
  // (one may show a field that the other fills), and the day after an exception's end shows what comes back.
  const strict = async (d: Record<string, Json>) => (await validate(schema, brickKey, d, { ...options, mode: 'create' })).errors
  const keyOf = (issue: Issue) => `${issue.path}\u0000${issue.code}`
  const all = good.map((g) => g.change)
  let known = new Set((await strict(data)).map(keyOf))
  const days = [...new Set(good.flatMap((g) => (g.change.until ? [g.change.from, addDay(g.change.until)] : [g.change.from])))].sort()
  for (const day of days) {
    const ofDay = good.filter((g) => g.change.from === day)
    const current = dataOn(data, all, day)
    const changed = new Set(ofDay.flatMap((g) => Object.keys(g.change.set)))
    // A day where only exceptions end saves nothing new: its values are checked for what they newly break.
    const saved = changed.size ? (await validate(schema, brickKey, current, { ...options, mode: 'patch', changed })).errors : []
    const errors = await strict(current)
    const taken = new Set<string>()
    const ended = good.filter((g) => g.change.until !== undefined && addDay(g.change.until) === day)
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
