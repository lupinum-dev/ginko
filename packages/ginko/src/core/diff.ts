import { effectiveMax, effectiveMin, isTranslatable } from './fields.ts'
import { BRICK_KEYS, FIELD_KEYS, SCHEMA_KEYS } from './schema.ts'
import { sameLabel } from './labels.ts'
import { bare, msg, type CoreKey, type Described, type Msg } from './messages.ts'
import { stableJson } from './sha256.ts'
import type { Brick, Field, Fields, Json, Schema } from './types.ts'

/** A change with its catalog key and parameters (`key`, `params`) next to the German `message`. */
export interface SchemaChange extends Described {
  path: string
  kind: string
  /** For rejected changes: the allowed way to reach the goal, in German; `fixMsg` is the same as a catalog message. */
  fix?: string
  fixMsg?: Msg
}

export interface SchemaDiff {
  changes: SchemaChange[]
  rejected: SchemaChange[]
}

const fx = (key: Extract<CoreKey, `diff.fix.${string}`> extends `diff.fix.${infer K}` ? K : never) => msg(`diff.fix.${key}`)
const NEW_FIELD_FIX = fx('newField')

/**
 * Production schemas only grow (SPEC 2.4). Everything not explicitly allowed is rejected.
 * A new required field is allowed when a migration that is new in `next` fills it.
 */
export function diffSchema(prod: Schema, next: Schema): SchemaDiff {
  const changes: SchemaChange[] = []
  const rejected: SchemaChange[] = []
  const ok: Report = (path, kind, m) => changes.push({ path, kind, ...m })
  const no: Report = (path, kind, m, fix = NEW_FIELD_FIX) => rejected.push({ path, kind, ...m, fix: fix.message, fixMsg: bare(fix) })
  unknownChanges('Schema', prod, next, SCHEMA_KEYS, no)

  if (prod.site !== next.site) no('site', 'site', msg('diff.siteRenamed'), fx('newSite'))
  // A site without bricks has no content yet (sites.create, sites:bootstrap): its first release sets
  // currency, languages and time zone freely; from then on they are fixed (Astra 9).
  const fresh = Object.keys(prod.bricks).length === 0
  if (fresh) {
    for (const k of ['currency', 'timeZone'] as const) if (prod[k] !== next[k]) ok(k, k, msg('diff.freshSetting', { name: k, value: next[k] }))
    if (prod.locales.join(',') !== next.locales.join(',')) ok('locales', 'locales', msg('diff.freshLocales', { locales: next.locales.join(', ') }))
  } else {
    if (prod.currency !== next.currency) no('currency', 'currency', msg('diff.currencyChanged'), fx('moneyFields'))
    if (prod.locales[0] !== next.locales[0]) no('locales', 'mainLocale', msg('diff.mainLocaleChanged'), fx('planMigration'))
    for (const locale of prod.locales) if (!next.locales.includes(locale)) no('locales', 'localeRemoved', msg('diff.localeRemoved', { locale }), fx('keepLocale'))
    const prodOrder = prod.locales.join(',')
    if (next.locales.slice(0, prod.locales.length).join(',') !== prodOrder && prod.locales.every((l) => next.locales.includes(l))) {
      no('locales', 'localeOrder', msg('diff.localeOrder'), fx('keepLocaleOrder'))
    }
    for (const locale of next.locales) if (!prod.locales.includes(locale)) ok('locales', 'localeAdded', msg('diff.localeAdded', { locale }))
    // The time zone moves the end of every stored expiry date, so it is not a free text like name and url.
    if (prod.timeZone !== next.timeZone) no('timeZone', 'timeZone', msg('diff.timezoneChanged'), fx('keepTimezone'))
  }
  for (const k of ['name', 'url'] as const) if (prod[k] !== next[k]) ok(k, k, msg('diff.valueChanged', { name: k }))
  if (stableJson(prod.week) !== stableJson(next.week)) ok('week', 'week', msg('diff.valueChanged', { name: 'week' }))
  if ((prod.holidays ?? null) !== (next.holidays ?? null)) ok('holidays', 'holidays', msg('diff.valueChanged', { name: 'holidays' }))
  if (stableJson(prod.pages) !== stableJson(next.pages)) ok('pages', 'pages', msg('diff.pagesChanged'))
  // A policy, not a data contract: switching agent review on or off changes no stored shape (SPEC 17).
  if (stableJson((prod.agents ?? null) as Json) !== stableJson((next.agents ?? null) as Json)) ok('agents', 'agents', msg('diff.agentsChanged'))

  for (const [path, rule] of Object.entries(prod.retired)) {
    const now = next.retired[path]
    if (!now) no(`retired.${path}`, 'unretired', msg('diff.retiredBack', { path }), fx('newFieldOnly'))
    else if (stableJson(now) !== stableJson(rule)) no(`retired.${path}`, 'retiredChanged', msg('diff.retiredRuleChanged', { path }), fx('keepRule'))
  }
  for (const path of Object.keys(next.retired)) if (!prod.retired[path]) ok(`retired.${path}`, 'retired', msg('diff.retiredNow', { path }))

  // Migration descriptors: new ones are allowed when they fill a field production lacks;
  // known IDs keep their identity; dropping old code from the config is harmless (SPEC 2.6).
  const prodMigrations = new Map(prod.migrations.map((m) => [m.id, m]))
  const newMigrations = next.migrations.filter((m) => !prodMigrations.has(m.id))
  for (const m of next.migrations) {
    const before = prodMigrations.get(m.id)
    if (before && stableJson(before) !== stableJson(m)) no(`migrations.${m.id}`, 'migrationChanged', msg('diff.migrationChanged', { id: m.id }), fx('newMigrationId'))
  }
  for (const m of newMigrations) {
    if (prod.bricks[m.brick]?.fields[m.fills]) no(`migrations.${m.id}`, 'migrationFillsExisting', msg('diff.migrationFillsExisting', { id: m.id, target: `${m.brick}.${m.fills}` }), fx('fillNewFieldsOnly'))
    else ok(`migrations.${m.id}`, 'migrationAdded', msg('diff.migrationAdded', { id: m.id }))
  }
  for (const m of prod.migrations) if (!next.migrations.some((x) => x.id === m.id)) ok(`migrations.${m.id}`, 'migrationDropped', msg('diff.migrationDropped', { id: m.id }))
  const newFills = new Set(newMigrations.map((m) => `${m.brick}.${m.fills}`))

  const newLocales = new Set(next.locales.filter((l) => !prod.locales.includes(l)))
  for (const [key, before] of Object.entries(prod.bricks)) {
    const after = next.bricks[key]
    if (!after) { no(key, 'brickRemoved', msg('diff.brickRemoved', { key }), fx('retireBrick')); continue }
    diffBrick(key, before, after, newFills, newLocales, ok, no)
  }
  for (const [key, brick] of Object.entries(next.bricks)) {
    if (prod.bricks[key]) continue
    ok(key, 'brickAdded', msg('diff.brickAdded', { key }))
    if (brick.kind === 'single') {
      for (const [name, field] of Object.entries(brick.fields)) {
        if (!field.optional && field.default === undefined) no(`${key}.${name}`, 'singleWithoutDefault', msg('diff.singleWithoutDefault', { name }), fx('defaultOrOptional'))
      }
    }
  }
  return { changes, rejected }
}

type Report = (path: string, kind: string, message: Described, fix?: Described) => void

// Presentation only: texts and the config position (`pos`) never change stored data.
const TEXT_KEYS = ['label', 'hint', 'unit', 'itemLabel', 'describe', 'group', 'pos']

function unknownChanges(at: string, a: object, b: object, known: Set<string>, no: Report) {
  const x = a as Record<string, unknown>
  const y = b as Record<string, unknown>
  for (const k of new Set([...Object.keys(x), ...Object.keys(y)])) {
    // Absent and null differ: `future: null` appearing is a change too.
    if (!known.has(k) && (Object.hasOwn(x, k) !== Object.hasOwn(y, k) || stableJson((x[k] ?? null) as Json) !== stableJson((y[k] ?? null) as Json))) no(at, 'unknownChange', msg('diff.unknownChange', { at, prop: k }), fx('keepProperty'))
  }
}

/** A field's data contract without its texts: what old code relies on. Nested `retired` flags stay part of it. */
function contract(field: Field, top = true): string {
  const copy = JSON.parse(JSON.stringify(field)) as Record<string, unknown>
  for (const k of TEXT_KEYS) delete copy[k]
  if (top) delete copy.retired
  if (Array.isArray(copy.options)) copy.options = (copy.options as { value: string }[]).map((o) => o.value)
  if (copy.of) copy.of = Object.fromEntries(Object.entries(copy.of as Fields).map(([k, v]) => [k, JSON.parse(contract(v, false))]))
  return stableJson(copy as never)
}

function diffBrick(key: string, before: Brick, after: Brick, newFills: Set<string>, newLocales: Set<string>, ok: Report, no: Report) {
  if (before.kind !== after.kind) return no(key, 'kindChanged', msg('diff.kindChanged', { key }))
  unknownChanges(key, before, after, BRICK_KEYS, no)
  if (before.retired && !after.retired) no(key, 'unretired', msg('diff.unretired', { path: key }))
  if (!sameLabel(before.label, after.label)) ok(`${key}.label`, 'text', msg('diff.textChanged'))
  if (!sameLabel(before.describe ?? '', after.describe ?? '')) ok(`${key}.describe`, 'text', msg('diff.textChanged'))
  if ((before.layout ?? 'sections') !== (after.layout ?? 'sections')) ok(`${key}.layout`, 'text', msg('diff.textChanged'))
  if (stableJson(before.tasks ?? []) !== stableJson(after.tasks ?? [])) ok(`${key}.tasks`, 'tasks', msg('diff.tasksChanged'))
  // A rule on stored values, not a stored shape: no value changes when it comes, goes or names other fields.
  if (stableJson(before.planned ?? null) !== stableJson(after.planned ?? null)) ok(`${key}.planned`, 'planned', msg('diff.valueChanged', { name: 'planned' }))
  if (before.kind === 'collection' && after.kind === 'collection') {
    if (after.max < before.max) no(`${key}.max`, 'maxLowered', msg('diff.maxLowered', { at: key }), fx('keepMax'))
    else if (after.max > before.max) ok(`${key}.max`, 'maxRaised', msg('diff.maxRaised'))
    if (stableJson(before.route ?? null) !== stableJson(after.route ?? null)) {
      if (!before.route) ok(`${key}.route`, 'routeAdded', msg('diff.routeAdded'))
      else if (onlyNewLocalesAdded(before.route, after.route, newLocales)) ok(`${key}.route`, 'routeAdded', msg('diff.routeAddedLocale'))
      else no(`${key}.route`, 'routeChanged', msg('diff.routeChanged', { key }), fx('keepRoute'))
    }
    for (const k of ['order', 'visible', 'untranslated', 'plans', 'drafts'] as const) {
      if (stableJson(before[k] ?? null) !== stableJson(after[k] ?? null)) ok(`${key}.${k}`, k, msg('diff.valueChanged', { name: k }))
    }
  }
  diffFields(key, before.fields, after.fields, newFills, ok, no, true)
}

/** The existing addresses stay as they are; the only difference is an address for a language that is new in this release. */
function onlyNewLocalesAdded(before: Record<string, string | undefined>, after: Record<string, string | undefined> | undefined, newLocales: Set<string>): boolean {
  if (!after) return false
  if (Object.entries(before).some(([locale, route]) => after[locale] !== route)) return false
  return Object.keys(after).every((locale) => Object.hasOwn(before, locale) || newLocales.has(locale))
}

function diffFields(path: string, before: Fields, after: Fields, newFills: Set<string>, ok: Report, no: Report, topLevel: boolean) {
  for (const [name, old] of Object.entries(before)) {
    const at = `${path}.${name}`
    const next = after[name]
    if (!next) { no(at, 'fieldRemoved', msg('diff.fieldRemoved', { at })); continue }
    diffField(at, old, next, newFills, ok, no)
  }
  for (const [name, field] of Object.entries(after)) {
    if (before[name]) continue
    const at = `${path}.${name}`
    if (field.optional) ok(at, 'fieldAdded', msg('diff.fieldAdded', { at }))
    else if (field.default !== undefined) ok(at, 'fieldAdded', msg('diff.fieldAddedDefault', { at }))
    else if (topLevel && newFills.has(at)) ok(at, 'fieldAdded', msg('diff.fieldAddedMigration', { at }))
    else no(at, 'requiredWithoutDefault', msg('diff.requiredWithoutDefault', { at }), fx('defaultMigrationOrOptional'))
  }
}

function diffField(at: string, old: Field, next: Field, newFills: Set<string>, ok: Report, no: Report) {
  if (old.type !== next.type) return no(at, 'typeChanged', msg('diff.typeChanged', { at, from: old.type, to: next.type }))
  if (old.retired && !next.retired) no(at, 'unretired', msg('diff.unretired', { path: at }))
  // Rollback contract (SPEC 2.5): retiring freezes the production definition; old code reads it.
  if ((old.retired || next.retired) && contract(old) !== contract(next)) {
    return no(at, 'retiredFieldChanged', msg('diff.retiredFieldChanged', { at }), fx('keepDefinition'))
  }
  unknownChanges(at, old, next, FIELD_KEYS, no)
  if (old.optional && !next.optional) no(at, 'madeRequired', msg('diff.madeRequired', { at }))
  if (!old.optional && next.optional) ok(at, 'madeOptional', msg('diff.madeOptional', { at }))
  // 'manual' only stops machine suggestions; switching it changes no stored shape.
  if (isTranslatable(old) !== isTranslatable(next)) no(at, 'translationChanged', msg('diff.translationChanged', { at }))
  if (stableJson(old.default ?? null) !== stableJson(next.default ?? null)) no(at, 'defaultChanged', msg('diff.defaultChanged', { at }), fx('keepDefault'))
  const o = old as unknown as Record<string, unknown>
  const n = next as unknown as Record<string, unknown>
  if (!sameLabel(old.label, next.label)) ok(at, 'text', msg('diff.textChanged'))
  if (!sameLabel(old.hint ?? '', next.hint ?? '')) ok(at, 'text', msg('diff.textChanged'))
  if (!sameLabel(old.group ?? '', next.group ?? '')) ok(at, 'text', msg('diff.textChanged'))
  if (o.unit !== n.unit) ok(at, 'text', msg('diff.textChanged'))
  // Effective limits: removing `max: 500` from a text field means 200 again, which is a lowering.
  const [maxA, maxB] = [effectiveMax(old), effectiveMax(next)]
  if (maxB < maxA) no(at, 'maxLowered', msg('diff.maxLowered', { at }), fx('keepMax'))
  else if (maxB > maxA) ok(at, 'maxRaised', msg('diff.maxRaised'))
  const [minA, minB] = [effectiveMin(old), effectiveMin(next)]
  if (minB > minA) no(at, 'minRaised', msg('diff.minRaised', { at }), fx('keepMin'))
  else if (minB < minA) {
    // The allowed values of a number lie on a grid that starts at `min`. A lower min must keep every stored value on it.
    const step = (next as { step?: number }).step ?? 0
    const onGrid = next.type !== 'number' || (step > 0 && Math.abs(Math.round((minA - minB) / step) * step - (minA - minB)) <= 1e-9)
    if (onGrid) ok(at, 'minLowered', msg('diff.minLowered'))
    else no(at, 'minOffGrid', msg('diff.minOffGrid', { at, step }), fx('minOnGrid'))
  }
  for (const k of ['step', 'format', 'currency', 'from', 'accept', 'to', 'multiple', 'after'] as const) {
    if (stableJson(o[k] ?? null) !== stableJson(n[k] ?? null)) no(at, `${k}Changed`, msg('diff.propChanged', { at, prop: k }))
  }
  if ((old.type === 'choice' || old.type === 'choices') && (next.type === 'choice' || next.type === 'choices')) {
    for (const option of old.options) {
      const now = next.options.find((x) => x.value === option.value)
      if (!now) no(at, 'optionRemoved', msg('diff.optionRemoved', { at, option: option.value }), fx('keepOption'))
      else if (!sameLabel(now.label, option.label)) ok(at, 'text', msg('diff.optionRenamed'))
    }
    for (const option of next.options) if (!old.options.some((x) => x.value === option.value)) ok(at, 'optionAdded', msg('diff.optionAdded', { option: option.value }))
  }
  if (old.type === 'list' && next.type === 'list') {
    if (!sameLabel(old.itemLabel, next.itemLabel)) ok(at, 'text', msg('diff.textChanged'))
    if (old.unique !== next.unique) {
      if (next.unique) no(at, 'uniqueChanged', msg('diff.uniqueChanged', { at }), fx('newList'))
      else ok(at, 'uniqueDropped', msg('diff.uniqueDropped', { at }))
    }
    diffFields(at, old.of, next.of, newFills, ok, no, false)
  }
}
