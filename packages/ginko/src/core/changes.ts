// A dated change (D117): fields of an entry that take new values from a day on, "a new price from 1 November". One
// type for both homes (`$changes` in a file, a stored row on the platform), one function that applies them, one check.
import { isTranslatable, slugKeyOf } from './fields.ts'
import { labelOf } from './labels.ts'
import { bare, DEFAULT_LOCALE, msg, type CoreKey, type Msg } from './messages.ts'
import { treeFields } from './outline.ts'
import { isDate, validate, type ValidateOptions } from './validate.ts'
import type { Day } from './entry-status.ts'
import type { Brick, Field, Issue, Json, Schema } from './types.ts'

/**
 * Fields that take new values from the first minute of `from` (a day in the site's zone) on, for good. `set` holds
 * whole fields in storage format (a list is one field); `null` clears an optional field.
 */
export interface Change { from: Day; set: Record<string, Json> }

/** The keys a change will have later (a change with an end, a yearly one, a named one); refused as "not built yet". */
const LATER_KEYS = ['until', 'yearly', 'name']

/** `a` before `b` by their days; changes of one day keep their order. */
const byDay = (a: Change, b: Change) => (a.from < b.from ? -1 : a.from > b.from ? 1 : 0)

/**
 * The values of `day`: `data` (stored form) with every change whose `from` is at or before `day` applied, in the order
 * of their days. The one place a change is applied (D118): the file reader with the build's day, the platform's run on
 * the day, and the check.
 */
export function dataOn(data: Record<string, Json>, changes: readonly Change[] | undefined, day: Day): Record<string, Json> {
  const due = (changes ?? []).filter((c) => c.from <= day)
  if (!due.length) return data
  const out = { ...data }
  for (const change of [...due].sort(byDay)) {
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

/** An issue of one change: `change` is its index in the list that was checked. */
export type ChangeIssue = Issue & { change: number }

/**
 * The check of an entry's changes (D119), for `ginko check`, the file reader and the platform: `changes` is a list;
 * each change has a day in `from` and at least one field in `set`, and no other key (`until`, `yearly` and `name` are
 * not built yet); each field is one a change may set (`changeRefusal`); two changes of one day never set the same
 * field; and the entry as it is after each change passes the check of its fields, so a value in a change is checked
 * like the field (`patch` on the change's own fields: a problem of another stored field is not the change's).
 * `data` is the entry's stored data; `options` are passed to `validate` (references, files). Only errors.
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
  const seen = new Map<string, number>()
  changes.forEach((raw: unknown, index) => {
    const at = `$changes.${index}`
    if (!isRecord(raw)) return add(index, at, 'CHANGE', 'issues.changeShape')
    let ok = true
    for (const key of Object.keys(raw)) {
      if (key === 'from' || key === 'set') continue
      ok = false
      if (LATER_KEYS.includes(key)) add(index, `${at}.${key}`, 'NOT_YET', 'issues.changeNotYet', { key })
      else add(index, `${at}.${key}`, 'CHANGE', 'issues.changeKey', { key })
    }
    if (!isDate(raw.from)) {
      ok = false
      add(index, `${at}.from`, 'CHANGE', 'issues.changeDay', { value: String(raw.from ?? '') })
    }
    const set = raw.set
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
      if (typeof raw.from !== 'string') continue
      const key = `${raw.from}\u0000${name}`
      if (seen.has(key)) {
        ok = false
        add(index, name, 'CHANGE', 'issues.changeTwice', { from: raw.from, label: labelOf(brick.fields[name]!.label, DEFAULT_LOCALE, main) })
      } else seen.set(key, index)
    }
    if (ok) good.push({ index, change: { from: raw.from as Day, set: set as Record<string, Json> } })
  })
  // The entry after each change, in the order of the days: a later change builds on the values an earlier one left.
  let current = data
  for (const { index, change } of [...good].sort((a, b) => byDay(a.change, b.change))) {
    current = dataOn(current, [change], change.from)
    const changed = new Set(Object.keys(change.set))
    const { errors } = await validate(schema, brickKey, current, { ...options, mode: 'patch', changed })
    // `patch` always refuses an unknown stored field; only the change's own fields are the change's to answer for.
    for (const problem of errors.filter((e) => e.code !== 'UNKNOWN_FIELD' || changed.has(e.path))) out.push({ path: problem.path, code: problem.code, change: index, ...msg('issues.changeValue', { from: change.from, problem: bare(problem) }) })
  }
  return out
}

function isRecord(value: unknown): value is Record<string, Json> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
