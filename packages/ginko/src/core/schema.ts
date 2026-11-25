import { effectiveMax, effectiveMin, effectiveProfile, isTable, isTranslatable, MAX_CENTS, rowKeysOf } from './fields.ts'
import { isCurrency, isLocale, labelProblem, MAX_LOCALES } from './labels.ts'
import { sha256, stableJson } from './sha256.ts'
import { formatMb, limitOf } from './uploads.ts'
import { weeklyTask } from './stale.ts'
import { DAY_KEYS } from './time.ts'
import { CALENDAR_NAMES, holidaysOf, STORED_HOLIDAYS } from './holidays.ts'
import { componentProblems, type ComponentDef, type ComponentRegistry } from './components.ts'
import { factComponent, factProblem, FACT_TAG } from './facts.ts'
import { MARKDOWN_PROFILES, profileCovers } from './markdown.ts'
import type { SiteInput } from './site.ts'
import { isPrefillToken, LISTING_DETAIL_TYPES, LISTING_TITLE_TYPES, PREFILL_TOKENS, SCHEMA_FORMAT, type Brick, type CollectionBrick, type Currency, type Field, type Fields, type Json, type Label, type Locale, type Schema, type Task } from './types.ts'
import { coreMessage } from './messages.ts'
import { aspectProblems } from './frames.ts'
import { checkValue } from './validate.ts'
import { changeRefusal } from './changes.ts'
import type { RuleField, StatusRules } from './status.ts'

// Keys that would resolve to Object.prototype members in plain-object lookups, plus `prototype`.
const RESERVED_KEYS = new Set([...Object.getOwnPropertyNames(Object.prototype), 'prototype'])
/** `$page.<key>` and `$file.<id>` in Markdown texts (links.ts, file-refs.ts): no brick may take these names. */
const LINK_HEADS = new Set(['page', 'file'])
// A path that could leave the site or name a query or fragment instead of a page.
const UNSAFE_PATH = /\.\.|\/\/|[?#]/

// The serialized schema grammar. Unknown properties are rejected here and in diffSchema (deny by default).
export const SCHEMA_KEYS = new Set(['format', 'site', 'name', 'url', 'timeZone', 'locales', 'languages', 'currency', 'week', 'holidays', 'pages', 'bricks', 'migrations', 'retired', 'components', 'agents'])
export const COMPONENT_KEYS = new Set(['kind', 'label', 'describe', 'props', 'slots', 'children', 'parents', 'editor', 'open'])
// `drafts` is no option since 0.13 (every collection keeps changes until they are published), but schemas released
// before carry it: it stays known, so they still pass checkSchema and diffSchema, and nothing reads it.
export const BRICK_KEYS = new Set(['pos', 'kind', 'source', 'label', 'describe', 'fields', 'body', 'preview', 'layout', 'tasks', 'max', 'order', 'listing', 'tree', 'route', 'showUntil', 'untranslated', 'publishedOn', 'plans', 'timeline', 'drafts', 'status', 'retired'])
/** `planned` was a brick key before dated changes (D129): checkSchema tells a schema that still has it how to move. */
const BRICK_KEYS_AND_PLANNED = new Set([...BRICK_KEYS, 'planned'])
export const FIELD_KEYS = new Set(['pos', 'type', 'label', 'hint', 'unit', 'optional', 'default', 'translate', 'retired', 'max', 'min', 'step', 'format', 'currency', 'from', 'accept', 'maxBytes', 'options', 'of', 'itemLabel', 'unique', 'rows', 'profile', 'to', 'multiple', 'showWhen', 'askAgainWhen', 'group', 'after', 'aspect'])

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
    const tasks = brick.tasks?.map((task) => {
      const prefill = 'prefill' in task && task.prefill ? { prefill: storedPrefill(task.prefill, brick.fields, site.locales) } : {}
      // Fixed values are stored like a prefill; a token is not resolved in them (the check refuses it as a value).
      const set = 'set' in task && task.set ? { set: storedPrefill(task.set, brick.fields, site.locales) } : {}
      return { ...task, ...prefill, ...set }
    })
    // A config written for 0.12 or older may still say `drafts`: the new schema leaves it out (BRICK_KEYS).
    const { drafts: _drafts, ...rest } = brick as typeof brick & { drafts?: unknown }
    return [key, { ...rest, pos, fields: positioned(fields), ...(tasks ? { tasks } : {}), ...(isRetired(key) ? { retired: true as const } : {}) }]
  }))
  const migrations = Object.entries(site.migrations ?? {})
    .map(([id, m]) => ({ id, brick: m.brick, fills: m.fills, fingerprint: migrationFingerprint(m.brick, m.fills, m.compute) }))
    .sort((a, b) => a.id.localeCompare(b.id))
  return plain({
    format: SCHEMA_FORMAT,
    site: site.site,
    name: site.name,
    url: site.url,
    timeZone: site.timeZone,
    locales: [...site.locales],
    // The language tag per locale ("de-AT"), so the platform and the Studio format values (facts) as the site does.
    ...(site.languages && Object.keys(site.languages).length ? { languages: { ...site.languages } } : {}),
    currency: site.currency,
    // As the site states it; the server, the Studio and the site all read `schema.week`.
    week: site.week,
    // Resolved once, so the server and the Studio never run the site's code to know its holidays.
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
    if (key === 'of' && isTable(field)) return [[key, Object.fromEntries(Object.entries(field.of).map(([name, column]) => [name, storedField(column, locales)]))]]
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
  if (!isTable(field)) return value
  const storedRow = (row: Json): Json | undefined => {
    if (!isRecord(row)) return row
    const stored: Record<string, Json> = {}
    for (const [name, cell] of Object.entries(row)) {
      const column = Object.hasOwn(field.of, name) ? field.of[name] : undefined
      const v = column ? storedValue(column, cell, locales) : cell
      if (v === undefined) return undefined
      stored[name] = v
    }
    return stored
  }
  // A list's rows in order; a rows field's rows by key. Anything else stays as it is, so the schema check reports it.
  const entries: [string, Json][] | undefined = field.type === 'list' ? (Array.isArray(value) ? value.map((row, i) => [String(i), row]) : undefined) : isRecord(value) ? Object.entries(value) : undefined
  if (!entries) return value
  const rows: [string, Json][] = []
  for (const [key, row] of entries) {
    const stored = storedRow(row)
    if (stored === undefined) return undefined
    rows.push([key, stored])
  }
  return field.type === 'list' ? rows.map(([, row]) => row) : Object.fromEntries(rows)
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
  return Object.fromEntries(Object.entries(fields).map(([name, field], pos) => [name, isTable(field) ? { ...field, pos, of: positioned(field.of) } : { ...field, pos }]))
}

/** The reference fields of a brick, also those in list rows and rows fields, with their paths (`team.members.person`). */
function refsOf(fields: Fields, at: string): [string, Extract<Field, { type: 'ref' }>][] {
  return Object.entries(fields).flatMap(([name, field]): [string, Extract<Field, { type: 'ref' }>][] =>
    field.type === 'ref' ? [[`${at}.${name}`, field]] : isTable(field) ? refsOf(field.of, `${at}.${name}`) : [])
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
  site: true, name: true, url: true, platform: true, timeZone: true, locales: true, languages: true, week: true, currency: true,
  pages: true, bricks: true, linkCheck: true, redirects: true, seo: true, agents: true, components: true, migrations: true,
  retired: true, country: true, calendar: true, facts: true,
} satisfies Record<keyof SiteInput, true>

/**
 * Problems of a site config: those of its schema, plus the options that stay out of the schema (`country`, `calendar`).
 * The Nuxt build, `ginko check` and `ginko release` run it; the platform checks only the schema (checkSchema).
 * `rules`: the status rules the caller knows (`statusRules` of `@lupinum/ginko/patterns`). `schema` is the site's
 * serialized schema, passed by callers that already have it.
 */
export function checkSite(site: SiteInput, rules: StatusRules, given?: Schema): string[] {
  // The languages and the time zone have no default (design V2 5.4), and nothing else can be checked without them.
  const missing = [
    ...(!Array.isArray(site.locales) || site.locales.length === 0 ? [MISSING_LOCALES] : []),
    ...(site.timeZone === undefined ? [MISSING_TIME_ZONE] : []),
  ]
  if (missing.length) return missing
  const schema = given ?? serializeSchema(site)
  // A typo in a top-level key (`redirect`) would otherwise change nothing, silently.
  const problems = Object.keys(site).filter((key) => !Object.hasOwn(SITE_KEYS, key)).map((key) => `Unknown key “${key}”. Known keys: ${Object.keys(SITE_KEYS).join(', ')}.`)
  if (site.country !== undefined && !/^[A-Z]{2}$/.test(String(site.country))) problems.push(`country: invalid country “${String(site.country)}” (expected an ISO 3166-1 code such as “AT” or “DE”).`)
  if (site.calendar !== undefined && typeof site.calendar !== 'function' && !CALENDAR_NAMES.includes(site.calendar)) {
    problems.push(`calendar: unknown calendar “${String(site.calendar)}” (expected AT, DE, SG, none or a function (year) => holidays).`)
  }
  if (site.platform !== undefined && !isPlatformAddress(site.platform)) {
    problems.push(`platform: invalid address “${String(site.platform)}” (expected the Studio's https:// origin, such as “https://cms.example.com”; http:// only for localhost).`)
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
  return [...problems, ...checkSchema(schema, rules)]
}

/**
 * Structural problems of a schema itself (not of content). Empty when usable. The platform gets
 * schemas from the network (release, devPush), so any value is a problem list, never a crash. `rules`: the status
 * rules the caller knows; a status that names another rule is a problem.
 */
export function checkSchema(schema: unknown, rules: StatusRules): string[] {
  if (typeof schema !== 'object' || schema === null || Array.isArray(schema)) return ['The schema is not an object.']
  // Every other rule belongs to one form; a schema of another form would get a list of problems that are not its own.
  const format = (schema as { format?: unknown }).format
  if (format === undefined) return [`The schema has no format number, so it was written by a Ginko older than this one. Update @lupinum/ginko in the site to the version of the platform (format ${SCHEMA_FORMAT}) and release again.`]
  if (format !== SCHEMA_FORMAT) return [`The schema has format ${JSON.stringify(format)}, and this Ginko reads format ${SCHEMA_FORMAT} only. Use the same version of Ginko in the site and on the platform.`]
  try {
    return schemaProblems(schema as Schema, rules)
  } catch {
    return ['The schema has an invalid structure.']
  }
}

function schemaProblems(schema: Schema, rules: StatusRules): string[] {
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
  if (schema.timeZone === undefined) problems.push(MISSING_TIME_ZONE)
  else if (!isTimeZone(schema.timeZone)) problems.push(`Invalid time zone “${String(schema.timeZone)}” (expected for example “Europe/Vienna”).`)
  // Every site states its week, as its time zone: the calendar, planned weeks and rows of days read it.
  if (schema.week === undefined) problems.push(MISSING_WEEK)
  else if (!isWeek(schema.week)) problems.push(`week must be { firstDay, workdays }: firstDay one of ${DAY_KEYS.join(', ')}, workdays a list of 1 to 7 different days of these, for example \`week: { firstDay: 'mo', workdays: ['mo', 'tu', 'we', 'th', 'fr'] }\`.`)
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
    // A stored `planned` (before dated changes) gets its own sentence below.
    unknown(key, brick, BRICK_KEYS_AND_PLANNED)
    pushLabel(`${key}.label`, brick.label)
    if (brick.describe !== undefined) pushLabel(`${key}.describe`, brick.describe)
    if (brick.source !== undefined && brick.source !== 'files') problems.push(`${key}: source must be “files” or missing.`)
    if (brick.source === 'files' && Object.values(brick.fields).some((fd) => isTable(fd) && Object.values(fd.of).some((c) => c.type === 'markdown'))) problems.push(`${key}: in file bricks, markdown is only allowed as the text of the file, not in a list or a rows field.`)
    if (brick.body !== undefined) {
      const field = typeof brick.body === 'string' && Object.hasOwn(brick.fields, brick.body) ? brick.fields[brick.body] : undefined
      if (field?.type !== 'markdown' || field.retired) problems.push(`${key}.body: “${String(brick.body)}” is not a markdown field of this brick.`)
    }
    if (brick.preview !== undefined) {
      const pageKeys = Object.keys(schema.pages ?? {})
      if (brick.kind === 'collection' && brick.route) problems.push(`${key}.preview: the entries of “${key}” have pages of their own (route), so the preview opens them. Leave preview out.`)
      else if (typeof brick.preview !== 'string' || !Object.hasOwn(schema.pages ?? {}, brick.preview)) problems.push(`${key}.preview: “${String(brick.preview)}” is not a key of pages. Write one of ${pageKeys.length ? pageKeys.join(', ') : '(no pages yet)'}.`)
    }
    // Markdown in the front matter is not read yet: a file brick's markdown field is the text of its file, stated by `body`.
    if (brick.source === 'files') {
      for (const [name, field] of Object.entries(brick.fields)) {
        if (field.type === 'markdown' && !field.retired && name !== brick.body) problems.push(`${key}.${name}: in a file brick, a markdown field is the text of the file. Write \`body: '${name}'\` (one markdown field per file brick).`)
      }
    }
    // The platform holds only platform bricks: a reference from one to a file brick finds no entry there ever.
    if (brick.source !== 'files') {
      for (const [path, ref] of refsOf(brick.fields, key)) {
        if (schema.bricks[ref.to]?.source === 'files') problems.push(`${path}: points at “${ref.to}”, which comes from files; a brick on the platform can only point at platform bricks. Keep “${ref.to}” on the platform or move “${key}” to files.`)
      }
    }
    if (brick.layout !== undefined && brick.layout !== 'sections' && brick.layout !== 'tabs') problems.push(`${key}: layout must be “sections” or “tabs”.`)
    const names = Object.keys(brick.fields)
    if (names.length > SCHEMA_LIMITS.fieldsPerBrick) problems.push(`${key}: too many fields.`)
    for (const [name, field] of Object.entries(brick.fields)) {
      if (!/^[a-z][a-zA-Z0-9]{0,40}$/.test(name) || name === '_id' || RESERVED_KEYS.has(name)) problems.push(`${key}: invalid field name “${name}”.`)
      problems.push(...checkField(`${key}.${name}`, field, brick.fields, true, schema))
      if (field.retired && !schema.retired[`${key}.${name}`]) problems.push(`${key}.${name}: marked as retired, but has no rule in retired.`)
    }
    problems.push(...taskIdProblems(key, brick))
    for (const task of brick.tasks ?? []) {
      pushLabel(`${key}.${task.id}.label`, task.label)
      // A prefill is checked like a default: a value the field cannot hold would start the form broken.
      for (const [name, value] of Object.entries('prefill' in task ? task.prefill ?? {} : {})) {
        const field = Object.hasOwn(brick.fields, name) ? brick.fields[name] : undefined
        const path = `${key}.${task.id}.prefill.${name}`
        const token = isPrefillToken(value)
        if (!field) problems.push(`${path}: the field is missing.`)
        else if (!token && field.type === 'date' && typeof value === 'string' && value.startsWith('@')) problems.push(`${path}: unknown token “${value}” (known: ${PREFILL_TOKENS.join(', ')}).`)
        else if (!token) for (const p of checkValueIn(schema, field, value, path)) problems.push(`${p.path}: ${coreMessage('en', p.key, p.params)}`)
        else if (field.type !== 'date') problems.push(`${path}: “${value}” needs a date field.`)
      }
      if (task.kind === 'create' && task.fields !== undefined) problems.push(...createFieldsProblems(`${key}.${task.id}.fields`, task, brick))
      if (task.needsApproval !== undefined && typeof task.needsApproval !== 'boolean') problems.push(`${key}.${task.id}: needsApproval must be true or false.`)
      if ('when' in task && task.when !== undefined) problems.push(...whenProblems(`${key}.${task.id}`, task, task.when, brick, schema))
      if ('set' in task && task.set !== undefined) problems.push(...setProblems(`${key}.${task.id}`, task, task.set, brick, schema))
    }
    if (Object.hasOwn(brick, 'planned')) problems.push(`${key}.planned: a planned change is a dated change now. Remove planned and its two fields, and write \`timeline: { public: ['<field>'] }\` on the brick and \`when: { from: 'ask' }\` on the task that changes the field.`)
    if (brick.timeline !== undefined) problems.push(...timelineProblems(key, brick, schema))
    if (brick.status !== undefined) problems.push(...statusProblems(key, brick, schema, rules))
    if (brick.kind === 'single' && 'plans' in brick) problems.push(`${key}: plans are only allowed for collections.`)
    if (brick.kind === 'single' && 'publishedOn' in brick) problems.push(`${key}: publishedOn is only allowed for collections.`)
    if (brick.kind === 'collection') {
      if (!(brick.max >= 1 && brick.max <= 500)) problems.push(`${key}: max must be between 1 and 500.`)
      problems.push(...listingProblems(key, brick))
      if (brick.tree !== undefined) problems.push(...treeProblems(key, brick))
      if (brick.untranslated !== undefined && brick.untranslated !== 'hide' && brick.untranslated !== 'fallback') problems.push(`${key}: untranslated must be “hide” or “fallback”.`)
      else if (brick.untranslated === undefined && Array.isArray(schema.locales) && schema.locales.length > 1) {
        problems.push(`${key}: untranslated is missing. The site has more than one language, so say what an entry does in a language it has no text in: 'hide' leaves it out there, 'fallback' shows the main language.`)
      }
      if (brick.plans !== undefined) problems.push(...plansProblems(key, brick.plans, brick.fields, schema))
      if (brick.publishedOn !== undefined) {
        const field = typeof brick.publishedOn === 'string' ? brick.fields[brick.publishedOn] : undefined
        if (field?.type !== 'date' || field.retired) problems.push(`${key}.publishedOn: “${String(brick.publishedOn)}” is no date field of the brick. Name the date field that holds the day an entry was published, such as 'date'.`)
      }
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
      const slugs = Object.entries(brick.fields).filter(([, fd]) => fd.type === 'slug' && !fd.retired).map(([name]) => name)
      if (slugs.length > 1) problems.push(`${key}: a collection has one address (slug) field, not ${slugs.length} (${slugs.join(', ')}). Keep one and retire the others.`)
      if (brick.showUntil !== undefined) problems.push(...showUntilProblems(key, brick.showUntil, brick.fields))
    } else if (brick.fields && Object.values(brick.fields).some((fd) => fd.type === 'slug')) {
      problems.push(`${key}: single bricks have no address (slug).`)
    }
  }
  for (const [path, rule] of Object.entries(schema.retired)) {
    const [brickKey, fieldName, rowKey, ...rest] = path.split('.')
    const brick = schema.bricks[brickKey ?? '']
    if (!brick) { problems.push(`retired: brick “${brickKey}” is missing.`); continue }
    const keys = typeof rule === 'object' && rule !== null && !Array.isArray(rule) ? Object.keys(rule) : []
    if (keys.length !== 1 || !['from', 'value', 'drop'].includes(keys[0]!) || ('drop' in rule && rule.drop !== true)) {
      problems.push(`retired: “${path}” needs exactly one of { from }, { value } or { drop: true }.`)
      continue
    }
    // `brick.field.row`: a row a rows field no longer has; the release removes it from the stored entries (diffSchema).
    if (rowKey !== undefined) {
      const field = fieldName !== undefined && Object.hasOwn(brick.fields, fieldName) ? brick.fields[fieldName] : undefined
      if (rest.length || field?.type !== 'rows') problems.push(`retired: “${path}” names no row of a rows field. Write \`brick.field.row\`, such as 'team.shifts.mo'.`)
      else if (!('drop' in rule)) problems.push(`retired: the row “${path}” takes { drop: true }.`)
      else if (isWeek(schema.week) && rowKeysOf(field, schema.week).includes(rowKey)) problems.push(`retired: “${path}” is still a row of the field. Retire a row only when the field no longer has it.`)
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
      for (const p of checkValueIn(schema, field, rule.value, `retired.${path}`)) problems.push(`${p.path}: ${coreMessage('en', p.key, p.params)}`)
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

/**
 * `listing` of a collection: an object with `title`, and optionally `detail`, `group` and `image`, each naming a live
 * field of a type that can show it. Required: without it the Studio would have to guess which field names an entry.
 */
function listingProblems(key: string, brick: CollectionBrick): string[] {
  const listing: unknown = brick.listing
  if (listing === undefined) return [`${key}: listing is missing. Write \`listing: { title: '<field>' }\` with the field that names an entry (a text, longtext or date field).`]
  if (typeof listing !== 'object' || listing === null || Array.isArray(listing)) return [`${key}: listing must be an object such as { title: 'name' }.`]
  const problems: string[] = []
  for (const k of Object.keys(listing)) if (!['title', 'detail', 'group', 'image'].includes(k)) problems.push(`${key}.listing: unknown property “${k}” (known: title, detail, group, image).`)
  const rules: [string, readonly string[], string][] = [
    ['title', LISTING_TITLE_TYPES, 'a text, longtext or date field'],
    ['detail', LISTING_DETAIL_TYPES, 'a field that reads as one line (not a list, Markdown, image, file, reference or address)'],
    ['group', ['choice'], 'a choice field'],
    ['image', ['image'], 'an image field'],
  ]
  const values = listing as Record<string, unknown>
  for (const [name, types, what] of rules) {
    const value = values[name]
    if (value === undefined && name !== 'title') continue
    const field = typeof value === 'string' && Object.hasOwn(brick.fields, value) ? brick.fields[value] : undefined
    if (!field) problems.push(`${key}.listing.${name}: “${String(value)}” is not a field of this brick. Name ${what}.`)
    else if (field.retired) problems.push(`${key}.listing.${name}: “${String(value)}” is retired. Name another field first.`)
    else if (!types.includes(field.type)) problems.push(`${key}.listing.${name}: “${String(value)}” is a ${field.type} field. Name ${what}.`)
  }
  return problems
}

const TREE_KEYS = ['parent', 'section', 'tab', 'label', 'badge'] as const

/**
 * `tree` of a collection: `parent` names a live ref field to the same collection (one entry, not several); `section`,
 * `tab`, `label` and `badge` name live text fields. The tree is the owner's order, so the collection is sorted by hand.
 */
function treeProblems(key: string, brick: CollectionBrick): string[] {
  const tree: unknown = brick.tree
  if (typeof tree !== 'object' || tree === null || Array.isArray(tree)) return [`${key}: tree must be an object such as { parent: 'parent' }.`]
  const problems: string[] = []
  for (const k of Object.keys(tree)) if (!TREE_KEYS.includes(k as (typeof TREE_KEYS)[number])) problems.push(`${key}.tree: unknown property “${k}” (known: ${TREE_KEYS.join(', ')}).`)
  const values = tree as Record<string, unknown>
  for (const name of TREE_KEYS) {
    const value = values[name]
    if (value === undefined && name !== 'parent') continue
    const what = name === 'parent' ? `a ref field to ${key} itself (one entry)` : 'a text field'
    const field = typeof value === 'string' && Object.hasOwn(brick.fields, value) ? brick.fields[value] : undefined
    if (!field) problems.push(`${key}.tree.${name}: “${String(value)}” is not a field of this brick. Name ${what}.`)
    else if (field.retired) problems.push(`${key}.tree.${name}: “${String(value)}” is retired. Name another field first.`)
    else if (name === 'parent' ? field.type !== 'ref' || field.to !== key || field.multiple : field.type !== 'text') problems.push(`${key}.tree.${name}: “${String(value)}” is not ${what}.`)
  }
  if (brick.order !== 'manual') problems.push(`${key}.tree: a navigation tree is sorted by hand. Write \`order: 'manual'\`.`)
  return problems
}

function showUntilProblems(key: string, rule: unknown, fields: Fields): string[] {
  if (typeof rule !== 'object' || rule === null || Array.isArray(rule)) return [`${key}: showUntil must be an object { field, plusDays?, thenDelete? }.`]
  const { field, plusDays, thenDelete } = rule as Record<string, unknown>
  const problems: string[] = []
  for (const k of Object.keys(rule)) if (!['field', 'plusDays', 'thenDelete'].includes(k)) problems.push(`${key}.showUntil: unknown property “${k}”.`)
  const def = typeof field === 'string' && Object.hasOwn(fields, field) ? fields[field] : undefined
  if ((def?.type !== 'date' && def?.type !== 'daterange') || def.retired) problems.push(`${key}.showUntil needs a date or daterange field.`)
  if (plusDays !== undefined && !(Number.isInteger(plusDays) && (plusDays as number) >= 0)) problems.push(`${key}.showUntil: plusDays must be a whole number from 0.`)
  if (thenDelete !== undefined && typeof thenDelete !== 'boolean') problems.push(`${key}.showUntil: thenDelete must be true or false.`)
  return problems
}

/** `rows` of a rows field: `'weekdays'`, `'workdays'` or 1 to 50 rows `{ key, label }` with unique keys in the field-name pattern. */
function rowSetProblems(path: string, rows: unknown, main: Locale): string[] {
  if (rows === 'weekdays' || rows === 'workdays') return []
  if (!Array.isArray(rows) || rows.length < 1 || rows.length > 50) return [`${path}.rows: must be 'weekdays', 'workdays' or a list of 1 to 50 rows { key, label }.`]
  const problems: string[] = []
  const seen = new Set<string>()
  for (const row of rows as Json[]) {
    if (!isRecord(row) || Object.keys(row).sort().join(',') !== 'key,label') { problems.push(`${path}.rows: every row is { key, label }.`); continue }
    const key = row.key
    if (typeof key !== 'string' || !/^[a-z][a-zA-Z0-9]{0,40}$/.test(key) || RESERVED_KEYS.has(key)) { problems.push(`${path}.rows: invalid row key “${String(key)}” (a lowercase letter, then letters or digits, as a field name).`); continue }
    if (seen.has(key)) problems.push(`${path}.rows: the row key “${key}” is listed twice.`)
    seen.add(key)
    const label = labelProblem(`${path}.rows.${key}.label`, row.label as Label, main)
    if (label) problems.push(label)
  }
  return problems
}

/** `checkValue`, except for a rows field of days on a site without a valid week: its rows are unknown, and the week's own problem stands. */
function checkValueIn(schema: Schema, field: Field, value: unknown, path: string) {
  return field.type === 'rows' && typeof field.rows === 'string' && !isWeek(schema.week) ? [] : checkValue(schema, field, value, path)
}

function isWeek(week: unknown): boolean {
  if (typeof week !== 'object' || week === null || Array.isArray(week)) return false
  const { firstDay, workdays, ...rest } = week as { firstDay?: unknown; workdays?: unknown }
  const isDay = (day: unknown) => (DAY_KEYS as readonly unknown[]).includes(day)
  return isDay(firstDay) && Array.isArray(workdays) && workdays.length >= 1 && workdays.length <= 7 && workdays.every(isDay)
    && new Set(workdays).size === workdays.length && !Object.keys(rest).length
}

/** The kind each standard task id stands for: the Studio opens the task `edit` from a row, so the ids are fixed. */
const STANDARD_KINDS: Record<string, Task['kind']> = { add: 'create', edit: 'edit', remove: 'remove' }

/**
 * The ids of a brick's tasks: a letter, then letters and digits; unique in the brick; `add`, `edit` and `remove` only for
 * the task of that kind. An edit task names fields the brick has.
 */
function taskIdProblems(key: string, brick: Brick): string[] {
  const problems: string[] = []
  const seen = new Set<string>()
  for (const task of brick.tasks ?? []) {
    const id: unknown = task.id
    if (typeof id !== 'string' || !/^[a-z][a-zA-Z0-9]{0,40}$/.test(id)) problems.push(`${key}.tasks: “${String(id)}” is not a task id. Write a letter, then letters and digits, such as “price”.`)
    else if (seen.has(id)) problems.push(`${key}.tasks: the id “${id}” is used by two tasks. Give one of them another id.`)
    else if (Object.hasOwn(STANDARD_KINDS, id) && STANDARD_KINDS[id] !== task.kind) problems.push(`${key}.${id}: “${id}” is the id of the standard ${STANDARD_KINDS[id] === 'create' ? 'add' : STANDARD_KINDS[id]} task. Give this ${task.kind === 'create' ? 'add' : task.kind} task another id.`)
    if (typeof id === 'string') seen.add(id)
    if (task.kind === 'edit') {
      for (const name of Array.isArray(task.fields) ? task.fields : []) {
        if (!Object.hasOwn(brick.fields, name)) problems.push(`${key}.${String(id)}.fields: “${name}” is not a field of this brick.`)
      }
    }
  }
  return problems
}

/** A task whose form saves a dated change: it asks a day, or holds for today only. */
export const taskDates = (task: Task): boolean => task.kind === 'edit' && task.when !== undefined && task.when.from !== 'now'

/** A task whose saves are exceptions that end by themselves (`when.until`). */
export const taskEnds = (task: Task): boolean => task.kind === 'edit' && task.when !== undefined && 'until' in task.when

/**
 * `when` of a task (D123, slice 3): an edit task only, one of `{ from: 'now' }`, `{ from: 'ask' }`, `{ from: 'ask',
 * until: 'ask' }`, `{ from: '@today', until: '@today' }`; a task that dates its values has only fields a change may set
 * (`changeRefusal`), so the form never offers a day for a field that cannot take one.
 */
function whenProblems(path: string, task: Task, when: unknown, brick: Brick, schema: Schema): string[] {
  if (task.kind !== 'edit') return [`${path}: when is only for an edit task.`]
  const forms = `${path}.when must be { from: 'now' }, { from: 'ask' }, { from: 'ask', until: 'ask' } or { from: '@today', until: '@today' }.`
  if (typeof when !== 'object' || when === null || Array.isArray(when) || Object.keys(when).some((k) => k !== 'from' && k !== 'until')) return [forms]
  const { from, until } = when as { from?: unknown; until?: unknown }
  if (from === 'now' && (until === 'ask' || until === '@today')) return [`${path}.when: until needs from: 'ask' or '@today'. With from: 'now' the values hold at once, for good.`]
  const valid = (from === 'now' && until === undefined) || (from === 'ask' && (until === undefined || until === 'ask')) || (from === '@today' && until === '@today')
  if (!valid) return [forms]
  if (from === 'now') return []
  const out: string[] = []
  for (const name of task.fields) {
    const refusal = changeRefusal(schema, brick, name)
    if (refusal === 'changeFixed') out.push(`${path}.when: “${name}” decides when or where an entry shows, so it cannot start on a day. Leave it out of the task or drop when.`)
    else if (refusal === 'changeTranslated') out.push(`${path}.when: “${name}” has text per language. A change from a day is not possible for such a field yet.`)
  }
  return out
}

/**
 * `set` of a task (slice 3): an edit task only; each field is one of the brick, not also asked in `fields`, holds a
 * value the field takes, and in a task that dates its values is one a change may set.
 */
function setProblems(path: string, task: Task, set: unknown, brick: Brick, schema: Schema): string[] {
  if (task.kind !== 'edit') return [`${path}: set is only for an edit task.`]
  if (typeof set !== 'object' || set === null || Array.isArray(set)) return [`${path}.set must be an object of field values, such as { shown: false }.`]
  const out: string[] = []
  for (const [name, value] of Object.entries(set)) {
    const field = Object.hasOwn(brick.fields, name) ? brick.fields[name] : undefined
    if (!field || field.retired) { out.push(`${path}.set: “${name}” is not a field of this brick.`); continue }
    if (task.fields.includes(name)) { out.push(`${path}.set: “${name}” is in the task's fields too. A field is either asked or set.`); continue }
    const refusal = taskDates(task) ? changeRefusal(schema, brick, name) : undefined
    if (refusal === 'changeFixed') { out.push(`${path}.set: “${name}” decides when or where an entry shows, so it cannot start on a day.`); continue }
    if (refusal === 'changeTranslated') { out.push(`${path}.set: “${name}” has text per language. A change from a day is not possible for such a field yet.`); continue }
    for (const p of checkValueIn(schema, field, value, `${path}.set.${name}`)) out.push(`${p.path}: ${coreMessage('en', p.key, p.params)}`)
  }
  return out
}

/**
 * A create task that lists `fields` names fields the brick has and can ask for, and leaves no required field without a
 * value: the slug is made from the title, a retired field is gone, and a field with a default or a prefill has a value.
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

/** A rule's field as words: “a date field”, “a rows field of weekdays”. */
const ruleFieldText = (need: RuleField) => `a ${need.type} field${need.rows ? ` of ${need.rows}` : ''}`

/** True when `field` is live and what `need` says. */
const meets = (field: Field | undefined, need: RuleField) => !!field && !field.retired && field.type === need.type && (need.rows === undefined || (field.type === 'rows' && field.rows === need.rows))

/**
 * A status line (`status`): exactly one kind. A collection takes next, count, missing or age: the field it names must be
 * live (a retired field needs the status removed first) and of the right type. A single takes the rule of a name in
 * `rules`, with every field the rule states; `plans` names a live collection of the site with the fields the rule states
 * for plans.
 */
function statusProblems(key: string, brick: Brick, schema: Schema, rules: StatusRules): string[] {
  const status: unknown = brick.status
  if (brick.kind === 'single') return ruleProblems(key, brick, schema, rules)
  const shape = '{ next }, { count: true }, { missing } or { age }'
  if (typeof status !== 'object' || status === null || Array.isArray(status)) return [`${key}: status must be ${shape}.`]
  const entries = Object.entries(status)
  if (entries.length !== 1 || !['next', 'count', 'missing', 'age'].includes(entries[0]![0])) return [`${key}: status must be ${shape}.`]
  const [kind, value] = entries[0]!
  if (kind === 'count') {
    if (value !== true) return [`${key}: status.count must be true.`]
    return (brick as CollectionBrick).showUntil ? [] : [`${key}: status { count: true } needs showUntil.`]
  }
  const field = typeof value === 'string' && Object.hasOwn(brick.fields, value) ? brick.fields[value] : undefined
  if (!field) return [`${key}: status.${kind} names “${String(value)}”, which is not a field of the brick.`]
  if (field.retired) return [`${key}: status.${kind} names the retired field “${value}”; remove the status or name another field.`]
  if (kind === 'missing') return field.optional && field.default === undefined ? [] : [`${key}: status.missing needs an optional field without a default, “${value}” is not.`]
  return field.type === 'date' || field.type === 'daterange' ? [] : [`${key}: status.${kind} needs a date or daterange field, “${value}” is a ${field.type} field.`]
}

/** The status of a single: `{ rule }` or `{ rule, plans }`, a rule the caller knows, with the fields it states. */
function ruleProblems(key: string, brick: Brick, schema: Schema, rules: StatusRules): string[] {
  const status: unknown = brick.status
  const known = Object.keys(rules).join(', ') || 'none'
  const isShape = typeof status === 'object' && status !== null && !Array.isArray(status)
    && typeof (status as { rule?: unknown }).rule === 'string'
    && Object.keys(status).every((k) => k === 'rule' || (k === 'plans' && typeof (status as { plans?: unknown }).plans === 'string'))
  if (!isShape) return [`${key}: status must be { rule: '<name>' } or { rule: '<name>', plans: '<key of a collection>' }. Known rules: ${known}.`]
  const { rule: name, plans } = status as { rule: string; plans?: string }
  const rule = Object.hasOwn(rules, name) ? rules[name]! : undefined
  if (!rule) return [`${key}: status.rule “${name}” is no rule Ginko knows. Known rules: ${known}.`]
  const problems: string[] = []
  for (const [field, need] of Object.entries(rule.inputs)) {
    if (!meets(Object.hasOwn(brick.fields, field) ? brick.fields[field] : undefined, need)) problems.push(`${key}: status.rule “${name}” needs the live field “${field}” (${ruleFieldText(need)}).`)
  }
  if (plans !== undefined) {
    const target = Object.hasOwn(schema.bricks, plans) ? schema.bricks[plans]! : undefined
    if (!rule.plans) problems.push(`${key}: status.rule “${name}” takes no plans; remove status.plans.`)
    else if (!target || target.retired) problems.push(`${key}: status.plans names “${plans}”, which is not a live brick of the site.`)
    else if (target.kind !== 'collection' || !Object.entries(rule.plans).every(([field, need]) => meets(Object.hasOwn(target.fields, field) ? target.fields[field] : undefined, need))) {
      problems.push(`${key}: status.plans names “${plans}”, which is not a collection with the fields the rule “${name}” needs (${Object.entries(rule.plans).map(([field, need]) => `${field}: ${ruleFieldText(need)}`).join(', ')}).`)
    }
  }
  return problems
}

/**
 * `timeline: { public: [fields] }` (D121): the fields whose waiting changes a page may read. Each is a live field that a
 * dated change may set (`changeRefusal`), named once.
 */
function timelineProblems(key: string, brick: Brick, schema: Pick<Schema, 'locales'>): string[] {
  const timeline: unknown = brick.timeline
  if (typeof timeline !== 'object' || timeline === null || Array.isArray(timeline)) return [`${key}: timeline must be an object { public: [fields] }, such as \`{ public: ['price'] }\`.`]
  const problems: string[] = []
  for (const k of Object.keys(timeline)) if (k !== 'public') problems.push(`${key}.timeline: unknown property “${k}”.`)
  const names: unknown = (timeline as Record<string, unknown>).public
  if (!Array.isArray(names) || !names.length || names.some((name) => typeof name !== 'string')) return [...problems, `${key}.timeline.public must list field names, such as \`['price']\`.`]
  if (new Set(names).size !== names.length) problems.push(`${key}.timeline.public names a field twice.`)
  for (const name of names as string[]) {
    const refusal = changeRefusal(schema, brick, name)
    if (refusal === 'unknownField') problems.push(`${key}.timeline.public: “${name}” is not a field of the brick.`)
    else if (refusal === 'changeFixed') problems.push(`${key}.timeline.public: “${name}” decides when or where an entry shows, so it cannot change on a day.`)
    else if (refusal === 'changeTranslated') problems.push(`${key}.timeline.public: “${name}” has text per language. On a site with several languages, a change from a day is not possible for such a field yet.`)
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
    case 'list': case 'rows': {
      const src = source as typeof target
      if (target.type === 'list' && target.unique && (src.type !== 'list' || src.unique !== target.unique)) return 'different uniqueness'
      if (target.type === 'rows' && stableJson(src.type === 'rows' ? src.rows as Json : null) !== stableJson(target.rows as Json)) return 'different rows'
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
  return field.type === 'image' || field.type === 'file' || (isTable(field) && Object.values(field.of).some(holdsFiles))
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

/** An origin without path: the site appends `/bundle/…` to it. Plain http only for the machine itself. */
function isPlatformAddress(value: unknown): boolean {
  if (typeof value !== 'string') return false
  try {
    const url = new URL(value)
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
    return (url.protocol === 'https:' || (url.protocol === 'http:' && local)) && value.replace(/\/$/, '') === url.origin
  } catch {
    return false
  }
}

const MISSING_LOCALES = "locales is missing. Write the site's languages, the main language first, for example `locales: ['de', 'en']`."
const MISSING_WEEK = "week is missing. Write the site's week, for example `week: { firstDay: 'mo', workdays: ['mo', 'tu', 'we', 'th', 'fr'] }`: the calendar and planned weeks start on firstDay, and rows of workdays are the workdays."
const MISSING_TIME_ZONE = "timeZone is missing. Write the site's time zone, for example `timeZone: 'Europe/Vienna'`: Ginko counts today, the week and planned dates in it."

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

/** `inRow`: a column of a rows field, whose `after` may name another column of the row. */
function checkField(path: string, field: Field, siblings: Fields, topLevel: boolean, schema: Schema, inRow = false): string[] {
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
  if (field.type !== 'image' && (field as { aspect?: unknown }).aspect !== undefined) problems.push(`${path}.aspect: only image fields have a frame.`)
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
  // A default on rows of workdays is refused below with one sentence; checking its rows would only repeat it.
  const refusedDefault = field.type === 'rows' && field.rows === 'workdays'
  if (field.default !== undefined && !refusedDefault) for (const p of checkValueIn(schema, field, field.default, `${path}.default`)) problems.push(`${p.path}: ${coreMessage('en', p.key, p.params)}`)
  // Retirement is per top-level field or brick (SPEC 2.5); a list column cannot be retired on its own. A component's
  // prop can: the editor no longer offers it, and texts that have it stay valid.
  if (!topLevel && field.retired && !path.startsWith('components.')) problems.push(`${path}: columns of a list cannot be retired one by one.`)
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
      if (!topLevel) problems.push(`${path}: lists and rows fields cannot be nested.`)
      if (!(field.max >= 1 && field.max <= 50)) problems.push(`${path}: max must be between 1 and 50.`)
      if (field.min !== undefined && !(Number.isInteger(field.min) && field.min >= 0 && field.min <= field.max)) problems.push(`${path}: min must be between 0 and max.`)
      if (field.unique !== undefined) {
        const u = field.of[field.unique]
        if (!u || u.optional || !['choice', 'text', 'date', 'time'].includes(u.type) || (u.type === 'text' && isTranslatable(u))) problems.push(`${path}: unique needs a required column of type choice, date, time or a text that is not translatable.`)
      }
      { const p = labelProblem(`${path}.itemLabel`, field.itemLabel, schema.locales[0] ?? ''); if (p) problems.push(p) }
      for (const [name, inner] of Object.entries(field.of)) {
        if (!/^[a-z][a-zA-Z0-9]{0,40}$/.test(name) || name === '_id' || RESERVED_KEYS.has(name)) problems.push(`${path}: invalid column name “${name}”.`)
        if (isTable(inner)) problems.push(`${path}.${name}: lists and rows fields cannot be nested.`)
        else if (inner.type === 'slug') problems.push(`${path}.${name}: slug is only allowed at the top level.`)
        else problems.push(...checkField(`${path}.${name}`, inner, field.of, false, schema))
      }
      break
    case 'rows':
      if (!topLevel) problems.push(`${path}: lists and rows fields cannot be nested.`)
      // A row is unique by its key; `unique` belongs to lists.
      if (Object.hasOwn(field, 'unique')) problems.push(`${path}: unknown property “unique”.`)
      problems.push(...rowSetProblems(path, field.rows, schema.locales[0] ?? ''))
      // The rows of workdays follow the site's week, so a value for them all would break when the week changes.
      if (field.rows === 'workdays' && field.default !== undefined) problems.push(`${path}: rows of workdays follow the site's week, so they take no default. Give the columns defaults instead (each new row starts with them).`)
      for (const [name, inner] of Object.entries(field.of)) {
        if (!/^[a-z][a-zA-Z0-9]{0,40}$/.test(name) || name === '_id' || RESERVED_KEYS.has(name)) problems.push(`${path}: invalid column name “${name}”.`)
        if (isTable(inner)) problems.push(`${path}.${name}: lists and rows fields cannot be nested.`)
        else if (inner.type === 'slug') problems.push(`${path}.${name}: slug is only allowed at the top level.`)
        else problems.push(...checkField(`${path}.${name}`, inner, field.of, false, schema, true))
      }
      break
    case 'ref': {
      const target = Object.hasOwn(schema.bricks, field.to) ? schema.bricks[field.to] : undefined
      if (target?.kind !== 'collection') problems.push(`${path}: to must name a collection (“${field.to}” does not exist).`)
      if (field.max !== undefined && !field.multiple) problems.push(`${path}: max needs multiple.`)
      if (field.max !== undefined && !(Number.isInteger(field.max) && field.max > 0)) problems.push(`${path}: max must be greater than 0.`)
      break
    }
    case 'image': if (field.aspect !== undefined) problems.push(...aspectProblems(path, field.aspect, RESERVED_KEYS)); break
    case 'file': if (!(field.maxBytes > 0 && field.maxBytes <= limitOf('file'))) problems.push(`${path}: maxBytes at most ${formatMb(limitOf('file'))} MB.`); break
    case 'time':
      if (field.after !== undefined && (!(topLevel || inRow) || siblings[field.after]?.type !== 'time' || field.after === path.split('.').pop())) {
        problems.push(`${path}.after: “${String(field.after)}” is not another time field of the ${inRow ? 'row' : 'brick'}.`)
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
