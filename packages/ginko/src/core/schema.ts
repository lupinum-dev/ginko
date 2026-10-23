import { effectiveMax, effectiveMin, effectiveProfile, isTranslatable, MAX_CENTS } from './fields.ts'
import { isCurrency, isLocale, labelProblem, MAX_LOCALES } from './labels.ts'
import { sha256 } from './sha256.ts'
import { formatMb, limitOf } from './uploads.ts'
import { weeklyTask } from './stale.ts'
import { weekInfoOf } from './time.ts'
import { CALENDAR_NAMES, holidaysOf, STORED_HOLIDAYS } from './holidays.ts'
import { componentProblems, type ComponentDef, type ComponentRegistry } from './components.ts'
import { factComponent, factProblem, FACT_TAG } from './facts.ts'
import { MARKDOWN_PROFILES, profileCovers } from './markdown.ts'
import type { SiteInput } from './site.ts'
import { isPrefillToken, PREFILL_TOKENS, type Brick, type CollectionBrick, type Currency, type Field, type Fields, type Json, type Label, type Locale, type Schema, type Task } from './types.ts'
import { coreMessage } from './messages.ts'
import { checkValue } from './validate.ts'

// Keys that would resolve to Object.prototype members in plain-object lookups, plus `prototype`.
const RESERVED_KEYS = new Set([...Object.getOwnPropertyNames(Object.prototype), 'prototype'])
/** `$page.<key>` and `$file.<id>` in Markdown texts (links.ts, file-refs.ts): no brick may take these names. */
const LINK_HEADS = new Set(['page', 'file'])
// A path that could leave the site or name a query or fragment instead of a page.
const UNSAFE_PATH = /\.\.|\/\/|[?#]/

// The serialized schema grammar. Unknown properties are rejected here and in diffSchema (deny by default).
export const SCHEMA_KEYS = new Set(['site', 'name', 'url', 'timeZone', 'locales', 'languages', 'currency', 'week', 'holidays', 'pages', 'bricks', 'migrations', 'retired', 'components', 'agents'])
export const COMPONENT_KEYS = new Set(['kind', 'label', 'describe', 'props', 'slots', 'children', 'parents', 'editor', 'open'])
export const BRICK_KEYS = new Set(['pos', 'kind', 'source', 'label', 'describe', 'fields', 'layout', 'tasks', 'max', 'order', 'route', 'visible', 'untranslated', 'plans', 'planned', 'drafts', 'status', 'retired'])
export const FIELD_KEYS = new Set(['pos', 'type', 'label', 'hint', 'unit', 'optional', 'default', 'translate', 'retired', 'max', 'min', 'step', 'format', 'currency', 'from', 'accept', 'maxBytes', 'options', 'of', 'itemLabel', 'unique', 'profile', 'to', 'multiple', 'showWhen', 'askAgainWhen', 'group', 'after'])

export const SCHEMA_LIMITS = { bytes: 256 * 1024, bricks: 30, fieldsPerBrick: 60 } as const

/**
 * Plain JSON for the platform: functions become fingerprints, retired fields get `retired: true`.
 * A value JSON cannot hold (function, Symbol, BigInt, undefined in a field, NaN, a cycle) is
 * not dropped silently: it is replaced by a `{ $lost }` marker, which checkSchema reports with its path.
 */
export function serializeSchema(site: SiteInput): Schema {
  const retired = site.retired ?? {}
  const isRetired = (path: string) => Object.hasOwn(retired, path) && Boolean(retired[path])
  // fromEntries creates own properties, so a key such as `__proto__` stays visible to checkSchema.
  const bricks = Object.fromEntries(Object.entries(site.bricks).map(([key, brick], pos) => {
    const fields: Fields = Object.fromEntries(Object.entries(brick.fields).map(([name, input]) => {
      const field = storedField(input, site.locales)
      return [name, isRetired(`${key}.${name}`) ? { ...field, retired: true as const } : field]
    }))
    const tasks = brick.tasks?.map((task) => 'prefill' in task && task.prefill ? { ...task, prefill: storedPrefill(task.prefill, brick.fields, site.locales) } : task)
    return [key, { ...brick, pos, fields: positioned(fields), ...(tasks ? { tasks } : {}), ...(isRetired(key) ? { retired: true as const } : {}) }]
  }))
  const migrations = Object.entries(site.migrations ?? {})
    .map(([id, m]) => ({ id, brick: m.brick, fills: m.fills, fingerprint: migrationFingerprint(m.brick, m.fills, m.compute) }))
    .sort((a, b) => a.id.localeCompare(b.id))
  return plain({
    site: site.site,
    name: site.name,
    url: site.url,
    timeZone: site.timeZone,
    locales: [...site.locales],
    // The language tag per locale ("de-AT"), so the platform and the Studio format values (facts) as the site does.
    ...(site.languages && Object.keys(site.languages).length ? { languages: { ...site.languages } } : {}),
    currency: site.currency,
    // Computed once here; the server, the Studio and the site all read `schema.week`.
    week: weekInfoOf(site.languages?.[site.locales[0]] ?? site.locales[0], site.firstDayOfWeek),
    // Like `week`: resolved once, so the server and the Studio never run the site's code to know its holidays.
    ...withHolidays(site),
    pages: Object.fromEntries(Object.entries(site.pages).map(([key, page]) => [key, typeof page === 'string' ? { [site.locales[0]]: page } : page])),
    bricks,
    migrations,
    retired,
    ...withComponents(site),
    ...(site.agents?.review !== undefined ? { agents: { review: site.agents.review } } : {}),
  }, [], []) as Schema
}

/**
 * `{ components }`: the site's registry plus the fact component of `facts` (facts.ts). Nothing when the site has
 * neither, so a schema without components stays as it was. Facts with problems are left out here; checkSite names them.
 */
function withComponents(site: SiteInput): { components?: ComponentRegistry } {
  const retired = site.retired ?? {}
  const facts = (site.facts ?? []).filter((path) => factProblem(path, site.bricks) === undefined && !Object.hasOwn(retired, path) && !Object.hasOwn(retired, path.split('.')[0]!))
  // Without components of its own the site's texts stay open: the fact component alone makes none of their tags unknown.
  const fact = (): ComponentDef => ({ ...factComponent(facts, site.bricks), ...(site.components === undefined ? { open: true as const } : {}) })
  const registry = facts.length && !Object.hasOwn(site.components ?? {}, FACT_TAG) ? { ...site.components, [FACT_TAG]: fact() } : site.components
  return registry ? { components: storedComponents(registry, site.locales) } : {}
}

/** `{ holidays }` when the config sets `calendar` or `country`; nothing otherwise, so a 0.4 schema stays as it was. */
function withHolidays(site: SiteInput): { holidays?: NonNullable<Schema['holidays']> } {
  const holidays = holidaysOf(site)
  return holidays === undefined ? {} : { holidays }
}

// Defaults and prefills are written in the input form (`f.text('Name', { default: 'Linde' })`) and stored in the
// stored form, here and nowhere else: the validator, the diff and the platform only see the stored form.

/** `field` with its `default` (and the defaults of list columns) in the stored form, keys in their order; see `storedValue`. */
function storedField(field: Field, locales: readonly Locale[]): Field {
  return Object.fromEntries(Object.entries(field).flatMap(([key, value]) => {
    if (key === 'of' && field.type === 'list') return [[key, Object.fromEntries(Object.entries(field.of).map(([name, column]) => [name, storedField(column, locales)]))]]
    if (key !== 'default' || value === undefined) return [[key, value]]
    const stored = storedValue(field, value as Json, locales)
    return stored === undefined ? [] : [[key, stored]]
  })) as Field
}

/** Component props with their defaults in the stored form, like brick fields. A malformed `props` stays for checkSchema to report. */
function storedComponents(registry: ComponentRegistry, locales: readonly Locale[]): ComponentRegistry {
  return Object.fromEntries(Object.entries(registry).map(([tag, def]) => {
    if (!def || typeof def.props !== 'object' || def.props === null) return [tag, def]
    return [tag, { ...def, props: Object.fromEntries(Object.entries(def.props).map(([name, prop]) => [name, storedField(prop, locales)])) }]
  }))
}

function storedPrefill(prefill: Readonly<Record<string, Json | undefined>>, fields: Fields, locales: readonly Locale[]): Record<string, Json> {
  const out: Record<string, Json> = {}
  for (const [name, input] of Object.entries(prefill)) {
    if (input === undefined) continue
    const field = Object.hasOwn(fields, name) ? fields[name] : undefined
    // Tokens stay; the platform resolves them when the task opens. Any other text is a value like a default.
    const value = field && !isPrefillToken(input) ? storedValue(field, input, locales) : input
    if (value !== undefined) out[name] = value
  }
  return out
}

/**
 * A config value in the stored form: the plain text of a translatable field is the main language's text, and texts
 * per language keep only the site's locales (a preset writes `{ de, en }` for every site). `undefined` when no text
 * in the main language is left: such a default or prefill was written for other sites and is left out, as if it had
 * none. The rule must not depend on the site's other locales, or a preset's `{ de, en }` would fail the schema check
 * on a site with the locales `fr`, `de`, `en`.
 */
function storedValue(field: Field, value: Json, locales: readonly Locale[]): Json | undefined {
  if (isTranslatable(field)) {
    if (typeof value === 'string') return { [locales[0]!]: value }
    // Anything but one text per language stays as it is, so the schema check reports it.
    if (!isRecord(value) || Object.values(value).some((text) => typeof text !== 'string')) return value
    const kept = Object.fromEntries(Object.entries(value).filter(([locale]) => locales.includes(locale)))
    return Object.hasOwn(kept, locales[0]!) ? kept : undefined
  }
  if (field.type !== 'list' || !Array.isArray(value)) return value
  const rows: Json[] = []
  for (const row of value) {
    if (!isRecord(row)) { rows.push(row); continue }
    const stored: Record<string, Json> = {}
    for (const [name, cell] of Object.entries(row)) {
      const column = Object.hasOwn(field.of, name) ? field.of[name] : undefined
      const v = column ? storedValue(column, cell, locales) : cell
      if (v === undefined) return undefined
      stored[name] = v
    }
    rows.push(stored)
  }
  return rows
}

const isRecord = (value: Json): value is { [key: string]: Json } => typeof value === 'object' && value !== null && !Array.isArray(value)

const LOST = '$lost'

/** Copy as plain JSON data. Anything JSON would drop or change is replaced by `{ $lost: <what> }`. */
function plain(value: unknown, path: string[], ancestors: unknown[]): unknown {
  switch (typeof value) {
    case 'string': case 'boolean': return value
    case 'number': return Number.isFinite(value) ? value : { [LOST]: String(value) }
    case 'bigint': return { [LOST]: 'a BigInt' }
    case 'symbol': return { [LOST]: 'a symbol' }
    case 'function': return { [LOST]: 'a function' }
    case 'undefined': return { [LOST]: 'undefined' }
  }
  if (value === null) return null
  if (ancestors.includes(value)) return { [LOST]: 'a circular structure' }
  ancestors.push(value)
  try {
    if (Array.isArray(value)) return value.map((item, i) => plain(item, [...path, String(i)], ancestors))
    const record = value as Record<string, unknown>
    // `undefined` is dropped like an absent property, except inside a field definition where it can hide a mistake.
    const keep = (key: string) => record[key] !== undefined || (path[0] === 'bricks' && path[2] === 'fields' && path.length >= 4)
    return Object.fromEntries(Object.keys(record).filter(keep).map((key) => [key, plain(record[key], [...path, key], ancestors)]))
  } finally {
    ancestors.pop()
  }
}

/** `bricks.menu.fields.price.default` → `menu.price.default`, like the other problem paths. */
function displayPath(path: string[]): string {
  return path.join('.').replace(/^bricks\./, '').replace(/\.fields\./, '.').replace(/\.of\./g, '.')
}

/** Problems for every `{ $lost }` marker in a schema, with the path of the value. */
function lostValues(value: unknown, path: string[]): string[] {
  if (typeof value !== 'object' || value === null) return []
  if (!Array.isArray(value) && Object.hasOwn(value, LOST)) {
    return [`${displayPath(path)}: ${String((value as Record<string, unknown>)[LOST])} cannot be stored (allowed: text, numbers, booleans, lists and objects).`]
  }
  return Object.keys(value).flatMap((key) => lostValues((value as Record<string, unknown>)[key], [...path, key]))
}

/** Fields with their config position, list columns too (stored objects lose key order). */
function positioned(fields: Fields): Fields {
  return Object.fromEntries(Object.entries(fields).map(([name, field], pos) => [name, field.type === 'list' ? { ...field, pos, of: positioned(field.of) } : { ...field, pos }]))
}

/** The schema the platform stores: without file bricks, which only the site's build reads (CONTENT.md). */
export function platformSchema(schema: Schema): Schema {
  return { ...schema, bricks: Object.fromEntries(Object.entries(schema.bricks).filter(([, brick]) => brick.source !== 'files')) }
}

/** Entries of bricks or fields in config order (`pos`), for anything that shows them in sequence. */
export function ordered<T extends { pos?: number }>(record: Record<string, T>): [string, T][] {
  return Object.entries(record).sort(([a, x], [b, y]) => (x.pos ?? Number.MAX_SAFE_INTEGER) - (y.pos ?? Number.MAX_SAFE_INTEGER) || a.localeCompare(b))
}

/**
 * A staff member's rights (`brick.task` grants, SPEC 2.7) by area: the live bricks in schema order, each with the
 * labels of its granted tasks in task order. A grant whose brick or task is gone or retired grants nothing and is
 * left out. The one reading of grants for the Team page, the invite mail and the invite page.
 */
export function grantGroups(schema: Pick<Schema, 'bricks'>, grants: readonly string[]): { brick: string; label: Label; tasks: Label[] }[] {
  const held = new Set(grants)
  return ordered(schema.bricks)
    .filter(([, brick]) => !brick.retired)
    .map(([key, brick]) => ({ brick: key, label: brick.label, tasks: (brick.tasks ?? []).filter((task) => held.has(`${key}.${task.id}`)).map((task) => task.label) }))
    .filter((group) => group.tasks.length > 0)
}

/** Exact source text: a changed literal inside the function must change the fingerprint. */
export function migrationFingerprint(brick: string, fills: string, compute: (...args: never[]) => unknown): string {
  return sha256(`${brick}\n${fills}\n${compute.toString()}`)
}

export function mainLocale(schema: Pick<Schema, 'locales'>): Locale {
  return schema.locales[0]!
}

// The top-level keys of a site config, typed against `SiteInput`: a new or renamed key fails the type check here.
const SITE_KEYS = {
  site: true, name: true, url: true, timeZone: true, locales: true, languages: true, firstDayOfWeek: true, currency: true,
  pages: true, bricks: true, linkCheck: true, redirects: true, seo: true, agents: true, components: true, migrations: true,
  retired: true, country: true, calendar: true, facts: true,
} satisfies Record<keyof SiteInput, true>

/**
 * Problems of a site config: those of its schema, plus the options that stay out of the schema (`country`, `calendar`).
 * The Nuxt build, `ginko check` and `ginko release` run it; the platform checks only the schema (checkSchema).
 * `schema` is the site's serialized schema, passed by callers that already have it.
 */
export function checkSite(site: SiteInput, schema: Schema = serializeSchema(site)): string[] {
  // A typo in a top-level key (`redirect`) would otherwise change nothing, silently.
  const problems = Object.keys(site).filter((key) => !Object.hasOwn(SITE_KEYS, key)).map((key) => `Unknown key “${key}”. Known keys: ${Object.keys(SITE_KEYS).join(', ')}.`)
  if (site.country !== undefined && !/^[A-Z]{2}$/.test(String(site.country))) problems.push(`country: invalid country “${String(site.country)}” (expected an ISO 3166-1 code such as “AT” or “DE”).`)
  if (site.calendar !== undefined && typeof site.calendar !== 'function' && !CALENDAR_NAMES.includes(site.calendar)) {
    problems.push(`calendar: unknown calendar “${String(site.calendar)}” (expected AT, DE, SG, none or a function (year) => holidays).`)
  }
  // The share cards' brand colour; any other format would draw them grey without a word.
  const color = site.seo?.color
  if (color !== undefined && !/^#(?:[\da-f]{3}|[\da-f]{6})$/i.test(color)) problems.push(`seo.color: invalid colour “${String(color)}” (expected “#rrggbb” or “#rgb”).`)
  // A key that names no page would keep nothing out of search, silently.
  for (const key of site.seo?.noindex ?? []) if (!Object.hasOwn(site.pages, key)) problems.push(`seo.noindex: “${key}” is not a key of pages.`)
  if (site.facts !== undefined) {
    if (!Array.isArray(site.facts)) problems.push('facts must be a list of “brick.field” paths.')
    else {
      for (const path of site.facts) {
        const problem = factProblem(String(path), site.bricks) ?? (site.retired && (Object.hasOwn(site.retired, path) || Object.hasOwn(site.retired, String(path).split('.')[0]!)) ? `facts: “${path}” is retired.` : undefined)
        if (problem) problems.push(problem)
      }
      if (new Set(site.facts).size !== site.facts.length) problems.push('facts: a path is listed twice.')
      if (site.facts.length && Object.hasOwn(site.components ?? {}, FACT_TAG)) problems.push(`components: “${FACT_TAG}” is the component of facts; rename the site's own component.`)
      if (site.facts.length > 50) problems.push('facts: at most 50.')
    }
  }
  return [...problems, ...checkSchema(schema)]
}

/**
 * Structural problems of a schema itself (not of content). Empty when usable. The platform gets
 * schemas from the network (release, devPush), so any value is a problem list, never a crash.
 */
export function checkSchema(schema: unknown): string[] {
  if (typeof schema !== 'object' || schema === null || Array.isArray(schema)) return ['The schema is not an object.']
  try {
    return schemaProblems(schema as Schema)
  } catch {
    return ['The schema has an invalid structure.']
  }
}

function schemaProblems(schema: Schema): string[] {
  // Values that never made it into the schema: every other check would only repeat the damage.
  const lost = lostValues(schema, [])
  if (lost.length) return lost
  const problems: string[] = []
  const unknown = (path: string, value: object, keys: Set<string>) => {
    for (const k of Object.keys(value)) if (!keys.has(k)) problems.push(`${path}: unknown property “${k}”.`)
  }
  unknown('Schema', schema, SCHEMA_KEYS)
  const main = schema.locales[0] ?? ''
  const pushLabel = (path: string, label: unknown) => { const p = labelProblem(path, label, main); if (p) problems.push(p) }
  if (!/^[a-z][a-z0-9-]{1,40}$/.test(schema.site)) problems.push(`Invalid site name “${schema.site}”.`)
  if (schema.locales.length === 0) problems.push('Locales are missing. Add at least one locale to `locales`.')
  if (schema.locales.length > MAX_LOCALES) problems.push(`Too many locales (at most ${MAX_LOCALES}).`)
  // Locales are the keys of the stored content: any canonical language tag, e.g. `es`, `pt-BR`, `zh-Hant`.
  for (const locale of schema.locales) if (!isLocale(locale)) problems.push(`Invalid locale “${String(locale)}” (expected a canonical language code such as “es”, “pt-BR” or “zh-Hant”).`)
  if (schema.languages !== undefined) {
    if (typeof schema.languages !== 'object' || schema.languages === null || Array.isArray(schema.languages)) problems.push('languages must be an object.')
    else {
      for (const [locale, language] of Object.entries(schema.languages)) {
        if (!schema.locales.includes(locale)) problems.push(`languages: locale “${locale}” is not in locales.`)
        if (!isLocale(language)) problems.push(`languages.${locale}: invalid language “${String(language)}” (expected a canonical language tag such as “de-AT” or “en-US”).`)
      }
    }
  }
  for (const locale of new Set(schema.locales.filter((l, i) => schema.locales.indexOf(l) !== i))) problems.push(`Locale “${locale}” is listed twice.`)
  if (!isSiteUrl(schema.url)) problems.push(`Invalid site url “${String(schema.url)}” (expected an absolute http(s) address such as “https://linde.example”).`)
  if (!isTimeZone(schema.timeZone)) problems.push(`Invalid time zone “${String(schema.timeZone)}” (expected for example “Europe/Vienna”).`)
  if (!isWeek(schema.week)) problems.push('week must be { firstDay: 1 to 7, weekend: [days 1 to 7] } (1 = Monday, 7 = Sunday).')
  if (schema.holidays !== undefined && !STORED_HOLIDAYS.includes(schema.holidays)) problems.push(`holidays must be one of ${STORED_HOLIDAYS.join(', ')}.`)
  if (!isCurrency(schema.currency)) problems.push(`Invalid currency “${String(schema.currency)}” (expected an ISO 4217 code such as “EUR” or “JPY”).`)
  const pageOwner = new Map<string, string>()
  for (const [key, paths] of Object.entries(schema.pages)) {
    if (!/^[a-z][a-zA-Z0-9-]{0,40}$/.test(key) || RESERVED_KEYS.has(key)) problems.push(`Invalid page name “${key}”.`)
    if (typeof paths !== 'object' || paths === null || Array.isArray(paths)) { problems.push(`pages.${key}: needs a path for each locale.`); continue }
    for (const [locale, path] of Object.entries(paths)) {
      if (!schema.locales.includes(locale as Locale)) problems.push(`pages.${key}: locale “${locale}” is not in locales.`)
      if (typeof path !== 'string' || !path.startsWith('/') || UNSAFE_PATH.test(path)) { problems.push(`pages.${key}.${locale}: page “${String(path)}” must start with “/” and must not contain “..”, “//”, “?” or “#”.`); continue }
      const owner = pageOwner.get(`${locale}:${path}`)
      if (owner) problems.push(`pages.${key}.${locale}: page “${path}” is already used by “${owner}”.`)
      else pageOwner.set(`${locale}:${path}`, key)
    }
  }
  if (new TextEncoder().encode(JSON.stringify(schema)).byteLength > SCHEMA_LIMITS.bytes) problems.push('The schema is too large (at most 256 KiB).')
  const brickKeys = Object.keys(schema.bricks)
  if (brickKeys.length > SCHEMA_LIMITS.bricks) problems.push(`Too many bricks (at most ${SCHEMA_LIMITS.bricks}).`)
  const routes = new Map<string, string>()
  for (const [key, brick] of Object.entries(schema.bricks)) {
    if (!/^[a-z][a-zA-Z0-9]{0,40}$/.test(key) || RESERVED_KEYS.has(key)) problems.push(`Invalid brick name “${key}”.`)
    else if (LINK_HEADS.has(key)) problems.push(`The brick name “${key}” is reserved: \`$${key}.…\` in a Markdown text means ${key === 'page' ? 'a page' : 'a file of the Files library'}.`)
    unknown(key, brick, BRICK_KEYS)
    pushLabel(`${key}.label`, brick.label)
    if (brick.describe !== undefined) pushLabel(`${key}.describe`, brick.describe)
    if (brick.source !== undefined && brick.source !== 'files') problems.push(`${key}: source must be “files” or missing.`)
    if (brick.source === 'files' && Object.values(brick.fields).some((fd) => fd.type === 'list' && Object.values(fd.of).some((c) => c.type === 'markdown'))) problems.push(`${key}: in file bricks, markdown is only allowed as the text of the file, not in a list.`)
    if (brick.source === 'files' && Object.values(brick.fields).filter((fd) => fd.type === 'markdown').length > 1) problems.push(`${key}: at most one markdown field (the text of the file).`)
    if (brick.layout !== undefined && brick.layout !== 'sections' && brick.layout !== 'tabs') problems.push(`${key}: layout must be “sections” or “tabs”.`)
    const names = Object.keys(brick.fields)
    if (names.length > SCHEMA_LIMITS.fieldsPerBrick) problems.push(`${key}: too many fields.`)
    for (const [name, field] of Object.entries(brick.fields)) {
      if (!/^[a-z][a-zA-Z0-9]{0,40}$/.test(name) || name === '_id' || RESERVED_KEYS.has(name)) problems.push(`${key}: invalid field name “${name}”.`)
      problems.push(...checkField(`${key}.${name}`, field, brick.fields, true, schema))
      if (field.retired && !schema.retired[`${key}.${name}`]) problems.push(`${key}.${name}: marked as retired, but has no rule in retired.`)
    }
    for (const task of brick.tasks ?? []) {
      pushLabel(`${key}.${task.id}.label`, task.label)
      // A prefill is checked like a default: a value the field cannot hold would start the form broken.
      for (const [name, value] of Object.entries('prefill' in task ? task.prefill ?? {} : {})) {
        const field = Object.hasOwn(brick.fields, name) ? brick.fields[name] : undefined
        const path = `${key}.${task.id}.prefill.${name}`
        const token = isPrefillToken(value)
        if (!field) problems.push(`${path}: the field is missing.`)
        else if (!token && field.type === 'date' && typeof value === 'string' && value.startsWith('@')) problems.push(`${path}: unknown token “${value}” (known: ${PREFILL_TOKENS.join(', ')}).`)
        else if (!token) for (const p of checkValue(schema, field, value, path)) problems.push(`${p.path}: ${coreMessage('en', p.key, p.params)}`)
        else if (field.type !== 'date') problems.push(`${path}: “${value}” needs a date field.`)
      }
      if (task.kind === 'create' && task.fields !== undefined) problems.push(...createFieldsProblems(`${key}.${task.id}.fields`, task, brick))
      if (task.needsApproval !== undefined && typeof task.needsApproval !== 'boolean') problems.push(`${key}.${task.id}: needsApproval must be true or false.`)
    }
    if (brick.planned !== undefined) problems.push(...plannedProblems(key, brick))
    if (brick.status !== undefined) problems.push(...statusProblems(key, brick, schema))
    // Drafts need entries that can wait for publishing; a single brick has one entry that is always live (SPEC 15).
    if (brick.kind === 'single' && 'drafts' in brick) problems.push(`${key}: drafts are only allowed for collections.`)
    if (brick.kind === 'single' && 'plans' in brick) problems.push(`${key}: plans are only allowed for collections.`)
    if (brick.kind === 'collection') {
      if (!(brick.max >= 1 && brick.max <= 500)) problems.push(`${key}: max must be between 1 and 500.`)
      if (brick.drafts !== undefined && typeof brick.drafts !== 'boolean') problems.push(`${key}: drafts must be true or false.`)
      if (brick.plans !== undefined) problems.push(...plansProblems(key, brick.plans, brick.fields, schema))
      if (brick.order !== 'manual' && !brick.fields[brick.order.field]) problems.push(`${key}: the sort field is missing.`)
      if (brick.order !== 'manual' && brick.order.dir !== undefined && brick.order.dir !== 'asc' && brick.order.dir !== 'desc') problems.push(`${key}: order.dir must be “asc” or “desc”.`)
      if (brick.route) {
        for (const locale of schema.locales) {
          const route = brick.route[locale]
          if (typeof route !== 'string' || !/^\/[^\s]*\[slug\][^\s]*$/.test(route)) problems.push(`${key}: route for “${locale}” is missing or has no [slug].`)
          else if (UNSAFE_PATH.test(route)) problems.push(`${key}: route for “${locale}” must not contain “..”, “//”, “?” or “#”.`)
          else if (!brick.retired) {
            const other = routes.get(`${locale} ${route}`)
            if (other !== undefined) problems.push(`${key}: route “${route}” for “${locale}” is also used by “${other}”.`)
            else routes.set(`${locale} ${route}`, key)
          }
        }
        if (!Object.values(brick.fields).some((fd) => fd.type === 'slug')) problems.push(`${key}: route needs a slug field.`)
      }
      const vis = brick.visible
      if (vis !== undefined) problems.push(...visibilityProblems(key, vis, brick.fields))
    } else if (brick.fields && Object.values(brick.fields).some((fd) => fd.type === 'slug')) {
      problems.push(`${key}: single bricks have no address (slug).`)
    }
  }
  for (const [path, rule] of Object.entries(schema.retired)) {
    const [brickKey, fieldName] = path.split('.')
    const brick = schema.bricks[brickKey ?? '']
    if (!brick) { problems.push(`retired: brick “${brickKey}” is missing.`); continue }
    const keys = typeof rule === 'object' && rule !== null && !Array.isArray(rule) ? Object.keys(rule) : []
    if (keys.length !== 1 || !['from', 'value', 'drop'].includes(keys[0]!) || ('drop' in rule && rule.drop !== true)) {
      problems.push(`retired: “${path}” needs exactly one of { from }, { value } or { drop: true }.`)
      continue
    }
    if (!fieldName) {
      if (!brick.retired) problems.push(`retired: brick “${brickKey}” has no retired marker.`)
      if (!('drop' in rule)) problems.push(`retired: brick “${brickKey}” takes { drop: true }.`)
      continue
    }
    const field = Object.hasOwn(brick.fields, fieldName) ? brick.fields[fieldName] : undefined
    if (!field) { problems.push(`retired: field “${path}” is missing.`); continue }
    if (!field.retired) problems.push(`retired: field “${path}” has no retired marker.`)
    if ('from' in rule) {
      const source = brick.fields[rule.from]
      if (!source || source.retired) problems.push(`retired: “${path}” mirrors a missing or retired field.`)
      else {
        const why = mirrorProblem(field, source, schema.currency)
        if (why) problems.push(`retired: “${path}” cannot mirror “${rule.from}”: ${why}.`)
      }
    } else if ('value' in rule) {
      // A constant would reference an upload that no entry holds: unchecked and swept after 7 days.
      if (holdsFiles(field)) problems.push(`retired: “${path}” contains images or files and cannot have a fixed value; use from or, for optional fields, drop.`)
      for (const p of checkValue(schema, field, rule.value, `retired.${path}`)) problems.push(`${p.path}: ${coreMessage('en', p.key, p.params)}`)
    } else if (!field.optional) {
      problems.push(`retired: required field “${path}” needs from or value, not drop.`)
    }
  }
  if (schema.agents !== undefined) {
    if (typeof schema.agents !== 'object' || schema.agents === null || Array.isArray(schema.agents)) problems.push('agents must be an object.')
    else {
      unknown('agents', schema.agents, new Set(['review']))
      if (schema.agents.review !== undefined && typeof schema.agents.review !== 'boolean') problems.push('agents.review must be true or false.')
    }
  }
  if (schema.components !== undefined) {
    if (typeof schema.components !== 'object' || schema.components === null || Array.isArray(schema.components)) problems.push('components must be an object.')
    else {
      problems.push(...componentProblems(schema.components, main))
      for (const [tag, def] of Object.entries(schema.components)) {
        unknown(`components.${tag}`, def, COMPONENT_KEYS)
        for (const [slot, { label }] of Object.entries(def.slots ?? {})) pushLabel(`components.${tag}.slots.${slot}.label`, label)
        // Props are ordinary fields: same grammar and limits as brick fields (`ref` must name a collection).
        for (const [name, field] of Object.entries(def.props ?? {})) problems.push(...checkField(`components.${tag}.props.${name}`, field, def.props, false, schema))
      }
    }
  }
  if (new Set(schema.migrations.map((m) => m.id)).size !== schema.migrations.length) problems.push('Migrations: duplicate ID.')
  for (const m of schema.migrations) {
    if (!/^\d{4}-\d{2}-[a-z0-9-]+$/.test(m.id)) problems.push(`Migration “${m.id}”: ID must look like “2026-11-name”.`)
    if (!/^[0-9a-f]{64}$/.test(m.fingerprint)) problems.push(`Migration “${m.id}”: invalid fingerprint.`)
    const target = schema.bricks[m.brick]?.fields[m.fills]
    if (!target) problems.push(`Migration “${m.id}”: field “${m.brick}.${m.fills}” is missing.`)
    else if (target.retired) problems.push(`Migration “${m.id}”: “${m.brick}.${m.fills}” is retired.`)
  }
  return problems
}

function visibilityProblems(key: string, vis: unknown, fields: Fields): string[] {
  if (typeof vis !== 'object' || vis === null || Array.isArray(vis)) return [`${key}: visible must be an object.`]
  const { mode, field, days, deleteExpired } = vis as Record<string, unknown>
  if (mode === 'always') return Object.keys(vis).length === 1 ? [] : [`${key}: visible: “always” takes no other options.`]
  if (mode !== 'until') return [`${key}: visible.mode must be “always” or “until”.`]
  const problems: string[] = []
  for (const k of Object.keys(vis)) if (!['mode', 'field', 'days', 'deleteExpired'].includes(k)) problems.push(`${key}.visible: unknown property “${k}”.`)
  const type = typeof field === 'string' && Object.hasOwn(fields, field) ? fields[field]!.type : undefined
  if (type !== 'date' && type !== 'daterange') problems.push(`${key}: visibility needs a date or daterange field.`)
  if (days !== undefined && !(Number.isInteger(days) && (days as number) >= 0)) problems.push(`${key}: visibility: days must be a whole number from 0.`)
  if (deleteExpired !== undefined && typeof deleteExpired !== 'boolean') problems.push(`${key}: visibility: deleteExpired must be true or false.`)
  return problems
}

const isIsoDay = (n: unknown) => Number.isInteger(n) && (n as number) >= 1 && (n as number) <= 7
function isWeek(week: unknown): boolean {
  if (typeof week !== 'object' || week === null) return false
  const { firstDay, weekend } = week as { firstDay?: unknown; weekend?: unknown }
  return isIsoDay(firstDay) && Array.isArray(weekend) && weekend.length <= 6 && weekend.every(isIsoDay)
}

/**
 * A create task that lists `fields` names fields the brick has and can ask for, and leaves no required field without a
 * value: the slug is made from the title, the plan of a planned change belongs to a dish that already has a price, a
 * retired field is gone, and a field with a default or a prefill has a value.
 */
function createFieldsProblems(path: string, task: Extract<Task, { kind: 'create' }>, brick: Brick): string[] {
  if (!Array.isArray(task.fields)) return [`${path}: must be a list of field names.`]
  const fields = brick.fields
  const listed: readonly string[] = task.fields
  const problems: string[] = []
  for (const name of listed) {
    const field = Object.hasOwn(fields, name) ? fields[name] : undefined
    if (!field) problems.push(`${path}: “${name}” is not a field of this brick.`)
    else if (field.type === 'slug') problems.push(`${path}: “${name}” is the address and is made from “${field.from}”, so the task cannot ask for it.`)
    else if (brick.planned && (name === brick.planned.next || name === brick.planned.from)) problems.push(`${path}: “${name}” is the plan of a planned change, so the task cannot ask for it.`)
    else if (field.retired) problems.push(`${path}: “${name}” is retired, so the task cannot ask for it.`)
  }
  const prefilled = Object.keys(task.prefill ?? {})
  for (const [name, field] of Object.entries(fields)) {
    if (field.optional || field.default !== undefined || field.type === 'slug' || field.retired) continue
    if (!listed.includes(name) && !prefilled.includes(name)) problems.push(`${path}: “${name}” is required and has no default, so the task must ask for it.`)
  }
  return problems
}

/** A collection that plans weeks of a single brick: the target must have a weekly task, the field must be a date here. */
function plansProblems(key: string, plans: unknown, fields: Fields, schema: Schema): string[] {
  if (typeof plans !== 'object' || plans === null || Array.isArray(plans)) return [`${key}: plans must be an object with brick and field.`]
  const { brick, field } = plans as { brick?: unknown; field?: unknown }
  const problems: string[] = []
  const target = typeof brick === 'string' && Object.hasOwn(schema.bricks, brick) ? schema.bricks[brick] : undefined
  if (!target) problems.push(`${key}: plans names the brick “${String(brick)}”, which does not exist.`)
  else if (target.kind !== 'single') problems.push(`${key}: plans needs a single brick, “${String(brick)}” is a collection.`)
  else if (!weeklyTask(target)) problems.push(`${key}: plans: “${String(brick)}” has no weekly task (an edit task with @workWeek).`)
  if (typeof field !== 'string' || !Object.hasOwn(fields, field) || fields[field]?.type !== 'date') problems.push(`${key}: plans needs a date field for the week start.`)
  // The weekly task edits a planned week in place of the single, so the week needs every field the task edits.
  const weekly = target?.kind === 'single' ? weeklyTask(target) : undefined
  const task = weekly?.task.kind === 'edit' ? weekly.task : undefined
  for (const f of task?.fields ?? []) {
    if (!Object.hasOwn(fields, f) || fields[f]!.type !== target!.fields[f]?.type) problems.push(`${key}: plans: the weekly task of “${String(brick)}” edits “${f}”, so this collection needs “${f}” of the same type.`)
  }
  return problems
}

/** The fields `{ hours: true }` reads, with their types: the stored names of the hours brick. */
const HOURS_FIELDS = { week: 'list', exceptions: 'list', closedOn: 'date', holidays: 'choice' } as const
/** The fields of an hour plan (`hourPlans()`), with their types: what `{ hours: { plans } }` reads of each entry. */
const HOUR_PLAN_FIELDS = { week: 'list', from: 'date', yearly: 'boolean' } as const

/** True when `brick` is a live collection with the live fields of `hourPlans()`. */
export function isHourPlans(brick: Brick): boolean {
  return brick.kind === 'collection' && !brick.retired
    && Object.entries(HOUR_PLAN_FIELDS).every(([name, type]) => Object.hasOwn(brick.fields, name) && !brick.fields[name]!.retired && brick.fields[name]!.type === type)
}

/**
 * A status line (`status`): exactly one kind; a collection takes next, count, missing or age, a single takes hours. The
 * field it names must be live (a retired field needs the status removed first) and of the right type. `hours` may
 * name the hour plans: a live collection of the site with the fields of `hourPlans()`.
 */
function statusProblems(key: string, brick: Brick, schema: Schema): string[] {
  const status: unknown = brick.status
  const kinds = brick.kind === 'collection' ? ['next', 'count', 'missing', 'age'] : ['hours']
  const shape = brick.kind === 'collection' ? '{ next }, { count: true }, { missing } or { age }' : '{ hours: true } or { hours: { plans } }'
  if (typeof status !== 'object' || status === null || Array.isArray(status)) return [`${key}: status must be ${shape}.`]
  const entries = Object.entries(status)
  if (entries.length !== 1 || !kinds.includes(entries[0]![0])) return [`${key}: status must be ${shape}.`]
  const [kind, value] = entries[0]!
  if (kind === 'count') {
    if (value !== true) return [`${key}: status.count must be true.`]
    const vis = (brick as CollectionBrick).visible
    return vis?.mode === 'until' ? [] : [`${key}: status { count: true } needs visible: { mode: 'until' }.`]
  }
  if (kind === 'hours') {
    const problems: string[] = []
    if (value !== true) {
      const plans = typeof value === 'object' && value !== null && !Array.isArray(value) && Object.keys(value).length === 1 ? (value as { plans?: unknown }).plans : undefined
      if (typeof plans !== 'string') return [`${key}: status.hours must be true or { plans: '<key of the hour plans>' }.`]
      const target = Object.hasOwn(schema.bricks, plans) ? schema.bricks[plans]! : undefined
      if (!target || target.retired) problems.push(`${key}: status.hours.plans names “${plans}”, which is not a live brick of the site.`)
      else if (!isHourPlans(target)) problems.push(`${key}: status.hours.plans names “${plans}”, which is not a collection of hour plans (hourPlans(): a list “week”, a date “from” and a switch “yearly”).`)
    }
    for (const [name, type] of Object.entries(HOURS_FIELDS)) {
      const field = Object.hasOwn(brick.fields, name) ? brick.fields[name] : undefined
      if (!field || field.retired) problems.push(`${key}: status { hours } needs the live field “${name}”.`)
      else if (field.type !== type) problems.push(`${key}: status { hours } needs “${name}” to be a ${type} field.`)
    }
    return problems
  }
  const field = typeof value === 'string' && Object.hasOwn(brick.fields, value) ? brick.fields[value] : undefined
  if (!field) return [`${key}: status.${kind} names “${String(value)}”, which is not a field of the brick.`]
  if (field.retired) return [`${key}: status.${kind} names the retired field “${value}”; remove the status or name another field.`]
  if (kind === 'missing') return field.optional && field.default === undefined ? [] : [`${key}: status.missing needs an optional field without a default, “${value}” is not.`]
  return field.type === 'date' || field.type === 'daterange' ? [] : [`${key}: status.${kind} needs a date or daterange field, “${value}” is a ${field.type} field.`]
}

/**
 * A planned change (`planned`): three different fields of the brick, `next` of the type of `field`, `from` a date, both
 * optional (no plan is the normal state). An edit task that changes `field` must show the plan too, so nobody changes a
 * price without seeing that another one is planned.
 */
function plannedProblems(key: string, brick: Brick): string[] {
  const planned: unknown = brick.planned
  if (typeof planned !== 'object' || planned === null || Array.isArray(planned)) return [`${key}: planned must be an object with field, next and from.`]
  const p = planned as Record<string, unknown>
  const problems: string[] = []
  for (const k of Object.keys(p)) if (!['field', 'next', 'from'].includes(k)) problems.push(`${key}.planned: unknown property “${k}”.`)
  const named = (role: 'field' | 'next' | 'from') => {
    const name = p[role]
    const field = typeof name === 'string' && Object.hasOwn(brick.fields, name) ? brick.fields[name] : undefined
    if (!field || field.retired) problems.push(`${key}: planned.${role} names “${String(name)}”, which is not a field of the brick.`)
    return field
  }
  const field = named('field')
  const next = named('next')
  const from = named('from')
  if (!field || !next || !from) return problems
  const [f, n, d] = [p.field as string, p.next as string, p.from as string]
  if (new Set([f, n, d]).size < 3) problems.push(`${key}: planned needs three different fields.`)
  if (next.type !== field.type) problems.push(`${key}: planned.next “${n}” needs the type of “${f}” (${field.type}).`)
  if (from.type !== 'date') problems.push(`${key}: planned.from “${d}” must be a date field.`)
  if (!next.optional || !from.optional) problems.push(`${key}: planned.next “${n}” and planned.from “${d}” must be optional.`)
  for (const task of brick.tasks ?? []) {
    if (task.kind === 'edit' && task.fields.includes(f) && !(task.fields.includes(n) && task.fields.includes(d))) {
      problems.push(`${key}.${task.id}: the task changes “${f}”, so it must also show its plan “${n}” and “${d}”.`)
    }
  }
  return problems
}

/**
 * Rollback contract (SPEC 2.5): old code reads the retired field as before, so every
 * value the source can hold must also be a valid value of the retired field.
 * Returns why not, or null when the mirror is safe.
 */
export function mirrorProblem(target: Field, source: Field, siteCurrency: Currency): string | null {
  if (source.type !== target.type) return `type ${source.type} instead of ${target.type}`
  if (isTranslatable(source) !== isTranslatable(target)) return 'different translatability'
  if (!target.optional && source.optional) return 'the source is optional, the old field is required'
  const t = target as unknown as Record<string, unknown>
  const s = source as unknown as Record<string, unknown>
  // Effective limits, so `max: 100000000` and an omitted money max compare equal.
  if (effectiveMax(source) > effectiveMax(target) || effectiveMin(source) < effectiveMin(target)) return 'the source allows values outside the old limits'
  switch (target.type) {
    case 'markdown':
      return profileCovers(effectiveProfile(target), effectiveProfile(source as typeof target)) ? null : 'the source allows more markdown (profile)'
    case 'text': case 'longtext':
      return (s.format ?? null) === (t.format ?? null) ? null : 'different format'
    case 'number':
      if (s.step !== t.step || Math.abs(((s.min as number) - (t.min as number)) / (t.step as number) % 1) > 1e-9) return 'different step'
      return null
    case 'money':
      return (s.currency ?? siteCurrency) === (t.currency ?? siteCurrency) ? null : 'different currency'
    case 'choice': case 'choices': {
      const allowed = new Set(target.options.map((o) => o.value))
      if ((source as typeof target).options.some((o) => !allowed.has(o.value))) return 'the source has options the old field does not know'
      return null
    }
    case 'list': {
      const src = source as typeof target
      if (target.unique && src.unique !== target.unique) return 'different uniqueness'
      const tKeys = Object.keys(target.of).sort().join(',')
      if (Object.keys(src.of).sort().join(',') !== tKeys) return 'different columns'
      for (const [key, inner] of Object.entries(target.of)) {
        const why = mirrorProblem(inner, src.of[key]!, siteCurrency)
        if (why) return `column “${key}”: ${why}`
      }
      return null
    }
    case 'file': {
      const src = source as typeof target
      if (src.accept.some((a) => !target.accept.includes(a))) return 'the source allows other files'
      return null
    }
    default:
      return null
  }
}

function holdsFiles(field: Field): boolean {
  return field.type === 'image' || field.type === 'file' || (field.type === 'list' && Object.values(field.of).some(holdsFiles))
}

const NUMBER_OPTIONS = ['min', 'max', 'step', 'maxBytes'] as const

/**
 * An absolute http(s) address without credentials, query or fragment: page paths are appended to it. The parsed
 * parts are '' for an empty `?` or `#`, so the normalised address is compared instead.
 */
function isSiteUrl(value: unknown): boolean {
  if (typeof value !== 'string') return false
  try {
    const url = new URL(value)
    return (url.protocol === 'https:' || url.protocol === 'http:') && url.href === url.origin + url.pathname
  } catch {
    return false
  }
}

/** An IANA time zone name this runtime's `Intl` knows, e.g. `Europe/Vienna`. */
export function isTimeZone(timeZone: unknown): timeZone is string {
  if (typeof timeZone !== 'string' || timeZone === '') return false
  try {
    new Intl.DateTimeFormat(undefined, { timeZone })
    return true
  } catch {
    return false
  }
}

function checkField(path: string, field: Field, siblings: Fields, topLevel: boolean, schema: Schema): string[] {
  const problems: string[] = []
  for (const k of Object.keys(field)) if (!FIELD_KEYS.has(k)) problems.push(`${path}: unknown property “${k}”.`)
  const labelIssue = labelProblem(`${path}.label`, field.label, schema.locales[0] ?? '')
  if (labelIssue) problems.push(labelIssue)
  const hintIssue = field.hint === undefined ? null : labelProblem(`${path}.hint`, field.hint, schema.locales[0] ?? '')
  if (hintIssue) problems.push(hintIssue)
  if (field.group !== undefined) {
    const groupIssue = labelProblem(`${path}.group`, field.group, schema.locales[0] ?? '')
    if (groupIssue) problems.push(groupIssue)
    else if (!topLevel) problems.push(`${path}.group: only fields of a brick can be grouped, not list columns.`)
  }
  if (field.showWhen !== undefined) {
    const when = field.showWhen as Record<string, unknown>
    const keys = Object.keys(when ?? {}).sort().join(',')
    if (keys !== 'field,is' && keys !== 'field,not') problems.push(`${path}.showWhen: needs \`field\` and one of \`is\` or \`not\`.`)
    else if (typeof when.field !== 'string' || !Object.hasOwn(siblings, when.field) || when.field === path.split('.').pop()) problems.push(`${path}.showWhen: “${String(when.field)}” is not another field next to this one.`)
  }
  if (field.type === 'choices' && field.askAgainWhen !== undefined) {
    const target = field.askAgainWhen
    const sibling = typeof target === 'string' && Object.hasOwn(siblings, target) ? siblings[target] : undefined
    if (target === path.split('.').pop() || (sibling?.type !== 'text' && sibling?.type !== 'longtext')) problems.push(`${path}.askAgainWhen: must name a text field next to it.`)
  }
  // Every number option is a finite number: JSON turns NaN and Infinity into null, which then compares as "no limit".
  let numbersOk = true
  for (const key of NUMBER_OPTIONS) {
    const value = (field as unknown as Record<string, unknown>)[key]
    const required = field.type === 'number' && key !== 'maxBytes'
    if ((value !== undefined || required) && !(typeof value === 'number' && Number.isFinite(value))) {
      problems.push(`${path}: ${key} must be a finite number.`)
      numbersOk = false
    }
  }
  if (field.default !== undefined) for (const p of checkValue(schema, field, field.default, `${path}.default`)) problems.push(`${p.path}: ${coreMessage('en', p.key, p.params)}`)
  // Retirement is per top-level field or brick (SPEC 2.5); a list column cannot be retired on its own.
  if (!topLevel && field.retired) problems.push(`${path}: columns of a list cannot be retired one by one.`)
  switch (field.type) {
    case 'text': {
      // Addresses run longer than prose (a Google Maps embed URL is often 600+ characters).
      const limit = field.format === 'url' ? 2000 : 500
      if (field.max !== undefined && field.max > limit) problems.push(`${path}: max at most ${limit}.`)
      break
    }
    case 'longtext': if (field.max !== undefined && field.max > 5000) problems.push(`${path}: max at most 5000.`); break
    case 'markdown':
      if (field.max !== undefined && field.max > 500000) problems.push(`${path}: max at most 500000.`)
      if (field.profile !== undefined && !MARKDOWN_PROFILES.includes(field.profile)) problems.push(`${path}: profile must be ${MARKDOWN_PROFILES.join(', ')}.`)
      if (field.default !== undefined) problems.push(`${path}: markdown cannot have a default.`)
      break
    case 'number': if (numbersOk && (!(field.step > 0) || field.min > field.max)) problems.push(`${path}: min/max/step is invalid.`); break
    case 'money':
      if (numbersOk) {
        if (field.min !== undefined && field.min < 0) problems.push(`${path}: min cannot be negative.`)
        if (field.max !== undefined && field.max > MAX_CENTS) problems.push(`${path}: max at most ${MAX_CENTS} cents.`)
        if (field.min !== undefined && field.max !== undefined && field.min > field.max) problems.push(`${path}: min/max is invalid.`)
      }
      if (field.currency !== undefined && !isCurrency(field.currency)) problems.push(`${path}: currency must be an ISO 4217 code (for example EUR, JPY).`)
      break
    case 'choice': case 'choices':
      if (field.options.length === 0 || field.options.length > 50) problems.push(`${path}: 1 to 50 options.`)
      if (new Set(field.options.map((o) => o.value)).size !== field.options.length) problems.push(`${path}: options are duplicated.`)
      for (const o of field.options) { const p = labelProblem(`${path}.${o.value}.label`, o.label, schema.locales[0] ?? ''); if (p) problems.push(p) }
      break
    case 'list':
      if (!topLevel) problems.push(`${path}: lists cannot be nested.`)
      if (!(field.max >= 1 && field.max <= 50)) problems.push(`${path}: max must be between 1 and 50.`)
      if (field.min !== undefined && !(Number.isInteger(field.min) && field.min >= 0 && field.min <= field.max)) problems.push(`${path}: min must be between 0 and max.`)
      if (field.unique !== undefined) {
        const u = field.of[field.unique]
        if (!u || u.optional || !['choice', 'text', 'date', 'time'].includes(u.type) || (u.type === 'text' && isTranslatable(u))) problems.push(`${path}: unique needs a required column of type choice, date, time or a text that is not translatable.`)
      }
      { const p = labelProblem(`${path}.itemLabel`, field.itemLabel, schema.locales[0] ?? ''); if (p) problems.push(p) }
      for (const [name, inner] of Object.entries(field.of)) {
        if (!/^[a-z][a-zA-Z0-9]{0,40}$/.test(name) || name === '_id' || RESERVED_KEYS.has(name)) problems.push(`${path}: invalid column name “${name}”.`)
        if (inner.type === 'list') problems.push(`${path}.${name}: lists cannot be nested.`)
        else if (inner.type === 'slug') problems.push(`${path}.${name}: slug is only allowed at the top level.`)
        else problems.push(...checkField(`${path}.${name}`, inner, field.of, false, schema))
      }
      break
    case 'ref': {
      const target = Object.hasOwn(schema.bricks, field.to) ? schema.bricks[field.to] : undefined
      if (target?.kind !== 'collection') problems.push(`${path}: to must name a collection (“${field.to}” does not exist).`)
      if (field.max !== undefined && !field.multiple) problems.push(`${path}: max needs multiple.`)
      if (field.max !== undefined && !(Number.isInteger(field.max) && field.max > 0)) problems.push(`${path}: max must be greater than 0.`)
      break
    }
    case 'file': if (!(field.maxBytes > 0 && field.maxBytes <= limitOf('file'))) problems.push(`${path}: maxBytes at most ${formatMb(limitOf('file'))} MB.`); break
    case 'time':
      if (field.after !== undefined && (!topLevel || siblings[field.after]?.type !== 'time' || field.after === path.split('.').pop())) {
        problems.push(`${path}.after: “${String(field.after)}” is not another time field of the brick.`)
      }
      break
    case 'slug': {
      const source = siblings[field.from]
      if (!source || !['text', 'longtext'].includes(source.type)) problems.push(`${path}: from must be a text field.`)
      if (!topLevel) problems.push(`${path}: slug is only allowed at the top level.`)
      break
    }
  }
  return problems
}
