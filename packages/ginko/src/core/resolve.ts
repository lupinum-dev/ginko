import { effectiveAlt, isTranslatable, rowKeysOf, slugKeyOf, startValue } from './fields.ts'
import { addDays, type SiteWeek } from './time.ts'
import { sha256, stableJson } from './sha256.ts'
import { resolveRouteLinks } from './links.ts'
import { resolveFileRefs } from './file-refs.ts'
import { BUNDLE_FORMAT, withMarkdownTrees, type Bundle, type BundleBrick, type BundleItem, type MarkdownTrees, type Upcoming } from './bundle.ts'
import { waitingChanges, type Change } from './changes.ts'
import type { MarkdownTree } from './markdown.ts'
import type { Brick, CollectionBrick, Field, Fields, Json, Locale, Schema } from './types.ts'

export interface StoredEntry {
  id: string
  /** Manual order position (collections with `order: 'manual'`). */
  order?: number
  data: Record<string, Json>
  /** Translation prints: leaf path → locale → sha256(stableJson(main-language value at translation time)). */
  prints?: Record<string, Partial<Record<Locale, string>>>
  /** The trees of the Markdown texts in `data` (`markdownTrees`), served in place of the texts; a text without one is parsed. */
  trees?: MarkdownTrees
  /** When the entry last changed (ISO 8601, UTC); goes to the bundle item unchanged. */
  updatedAt?: string
  /** Repo-relative path of the file per locale (a translation's own file); file entries only. */
  sources?: Partial<Record<Locale, string>>
  /** Old paths of a file entry (`$redirectFrom`); the bundle forwards them to the entry's page in every language (`oldUrls`). */
  redirectFrom?: string[]
  /**
   * The entry's waiting dated changes (a file's `$changes`, the platform's rows that are not stopped). `data` already
   * holds the values of today (D120): the bundle reads only the fields of `timeline.public` from the changes still
   * ahead, for `upcoming`; nothing else of them leaves the server.
   */
  changes?: Change[]
}

export interface FileInfo {
  url: string
  name: string
  size: number
  width?: number
  height?: number
  /** Focus point set by the owner (0..1 from the top left); only on platform uploads. */
  focus?: { x: number; y: number }
  /** Smaller WebP copies of the image, ascending width; each narrower than `width`. */
  variants?: { width: number; url: string }[]
  /** The description written in the Files library, per language; the default for every use without its own text. */
  alt?: Record<string, string>
}

export interface ResolveContext {
  locale: Locale
  /** Requested locale is unknown: deliver the main language and mark every translatable leaf as fallback. */
  markAllFallback?: boolean
  files: (id: string) => FileInfo | undefined
}

export interface ResolvedEntry {
  data: Record<string, unknown>
  /** Leaves delivered in the main language because their translation is missing. */
  fallback: string[]
  /**
   * Leaves whose translation was made for an older main-language text. They are delivered as they are, until someone
   * translates them again or confirms them (D6); the Studio lists them.
   */
  outdated: string[]
  /**
   * The required translatable leaves without text in this locale (an outdated one counts as translated): while there
   * is one, the entry has no page in this locale. Never for the main locale or an unknown one; slugs and image
   * descriptions never count, they fall back by design.
   */
  blocking: string[]
  /** `blocking` is not empty in a collection whose mode is `'hide'` (`untranslatedMode`): the bundle leaves the entry out of this locale. */
  hidden: boolean
}

/**
 * What an untranslated entry does, as the collection states it (`untranslated`). A site with one language need not
 * state it: no entry is untranslated there, so `'fallback'` changes nothing.
 */
export function untranslatedMode(brick: CollectionBrick): 'hide' | 'fallback' {
  return brick.untranslated ?? 'fallback'
}

/** The print that marks a translation as fresh for the current main-language value. */
export function printOf(mainValue: unknown): string {
  return sha256(stableJson(mainValue ?? null))
}

/** Stored entry → bundle form for one locale (SPEC part 6). */
export function resolveEntry(schema: Schema, brickKey: string, entry: StoredEntry, ctx: ResolveContext): ResolvedEntry {
  const brick = schema.bricks[brickKey]!
  const main = schema.locales[0]!
  const fallback: string[] = []
  const outdated: string[] = []
  const blocking: string[] = []
  const state: State = { schema, brickKey, entry, ctx, main, fallback, outdated, blocking }
  const data = resolveFields(brick.fields, entry.data, '', state)
  // Retired fields (SPEC 2.5) are projected after the live fields are resolved.
  for (const [name, field] of Object.entries(brick.fields)) {
    if (!field.retired) continue
    // checkSchema requires a rule for every retired field.
    const rule = schema.retired[`${brickKey}.${name}`]!
    if ('from' in rule) {
      if (rule.from in data) data[name] = data[rule.from]
      for (const leaf of [...fallback]) {
        if (leaf === rule.from || leaf.startsWith(`${rule.from}.`)) fallback.push(name + leaf.slice(rule.from.length))
      }
    } else if (entry.data[name] !== undefined) {
      // Nobody can edit a retired value any more, so it is never listed as outdated or as keeping the entry off a language.
      data[name] = resolveValue(field, entry.data[name], name, { ...state, blocking: [], outdated: [] })
    } else if ('value' in rule) {
      // Same fallback reporting as stored values; a constant never makes the entry untranslated, and has no prints.
      data[name] = resolveValue(field, rule.value, name, { ...state, blocking: [], outdated: [] })
    }
  }
  const hidden = blocking.length > 0 && brick.kind === 'collection' && untranslatedMode(brick) === 'hide'
  return { data, fallback, outdated, blocking, hidden }
}

interface State {
  schema: Schema
  brickKey: string
  entry: StoredEntry
  ctx: ResolveContext
  main: Locale
  fallback: string[]
  outdated: string[]
  /** Required leaves whose translation is missing. Retired fields and image descriptions get a list of their own that is dropped. */
  blocking: string[]
}

function resolveFields(fields: Fields, stored: Record<string, Json> | undefined, path: string, state: State) {
  const out: Record<string, unknown> = {}
  for (const [name, field] of Object.entries(fields)) {
    if (field.retired) continue
    const value = stored?.[name]
    if (value === undefined || value === null) continue
    // An optional text with a format (url, email, tel) that was cleared and stored as "" is absent, not an invalid address.
    if (value === '' && field.optional && field.type === 'text' && field.format) continue
    const at = path ? `${path}.${name}` : name
    const resolved = resolveValue(field, value, at, state)
    if (resolved !== undefined) out[name] = resolved
  }
  return out
}

function resolveValue(field: Field, value: Json, path: string, state: State): unknown {
  if (isTranslatable(field)) {
    const picked = localized(value, path, state, field)
    return field.type === 'markdown' ? storedTree(picked, value, path, state) : picked
  }
  switch (field.type) {
    case 'markdown':
      return storedTree(value, value, path, state)
    case 'money':
      return { amount: (value as { amount: number }).amount, currency: field.currency ?? state.schema.currency }
    case 'image': {
      const v = value as { file: string; alt: Json }
      const file = state.ctx.files(v.file)
      if (!file) return undefined
      return { url: file.url, alt: altOf(v.alt, file.alt, `${path}.alt`, state, field), width: file.width ?? 0, height: file.height ?? 0, ...(file.focus ? { focus: file.focus } : {}), ...(file.variants?.length ? { variants: file.variants } : {}), ...(field.aspect ? { aspect: field.aspect } : {}) }
    }
    case 'file': {
      const file = state.ctx.files((value as { file: string }).file)
      return file ? { url: file.url, name: file.name, size: file.size } : undefined
    }
    case 'list':
      return (value as Record<string, Json>[]).map((row) => ({ _id: row._id, ...resolveFields(field.of, row, `${path}.${String(row._id)}`, state) }))
    case 'rows': {
      // The rows the field has, in its order (the site's week for days); a stored row the field no longer has is left out.
      const rows = value as Record<string, Record<string, Json> | undefined>
      return Object.fromEntries(rowKeysOf(field, state.schema.week).flatMap((key) => {
        const row = Object.hasOwn(rows, key) ? rows[key] : undefined
        return row ? [[key, resolveFields(field.of, row, `${path}.${key}`, state)]] : []
      }))
    }
    default:
      return value
  }
}

/** The stored tree of the text `localized` picked: same leaf, and the requested locale or the main one, whichever holds that text. */
function storedTree(text: unknown, value: Json, leaf: string, state: State): unknown {
  const stored = state.entry.trees?.[leaf]
  if (stored === undefined || typeof text !== 'string') return text
  if (typeof value === 'string') return stored
  const locale = (value as Record<string, Json>)[state.ctx.locale] === text ? state.ctx.locale : state.main
  return (stored as Partial<Record<Locale, MarkdownTree>>)[locale] ?? text
}

/**
 * The description of an image use: its own text, else the Files library text (`effectiveAlt`). The
 * library text has no translation print, so it is never marked outdated.
 */
function altOf(own: Json, library: Record<string, string> | undefined, leaf: string, state: State, field: Field): string {
  const { locale, markAllFallback } = state.ctx
  const map = (own ?? {}) as Record<string, Json>
  const fromLibrary = (l: string) => (effectiveAlt(map, undefined, l) ? '' : effectiveAlt(undefined, library, l))
  // No own text in this language, but the library has one: it is the real text, not a fallback.
  if (!markAllFallback && locale !== state.main && fromLibrary(locale)) return fromLibrary(locale)
  // The main language's library text stands in for a missing own one, so translations compare against it.
  // A description is required in the main language only: a missing translation falls back and never makes the entry untranslated.
  const main = fromLibrary(state.main)
  return (localized(main ? { ...map, [state.main]: main } : map, leaf, { ...state, blocking: [] }, field) as string | undefined) ?? ''
}

const isEmpty = (value: Json | undefined) => value === undefined || value === null || value === ''

/**
 * One locale of a translatable leaf. Unknown requested locale: main language, every leaf
 * marked fallback, nothing hidden. A missing translation falls back to the main language. An
 * outdated one (its print is of an older main-language text) stays as it is and is listed in
 * `outdated` (D6): a typo fix in the main language never turns a translated text into the main
 * language, nor takes a page away. Slugs are identities fixed at creation, never outdated: a
 * missing slug falls back to the main slug, the same rule `routeUrls` uses.
 */
function localized(value: Json, leaf: string, state: State, field: Field): unknown {
  const map = (value ?? {}) as Partial<Record<Locale, Json>>
  const mainValue = map[state.main]
  const { locale, markAllFallback } = state.ctx
  if (markAllFallback) {
    state.fallback.push(leaf)
    return mainValue
  }
  if (locale === state.main) return mainValue
  const own = map[locale]
  if (isEmpty(own)) {
    if (!isEmpty(mainValue)) {
      state.fallback.push(leaf)
      if (!field.optional && field.type !== 'slug') state.blocking.push(leaf)
    }
    return mainValue
  }
  if (field.type === 'slug' || state.entry.prints?.[leaf]?.[locale] === printOf(mainValue)) return own
  // The main language no longer has this text: its old translation goes too.
  if (isEmpty(mainValue)) return mainValue
  state.outdated.push(leaf)
  return own
}

/** Stored-format data built from the fields' defaults (new singletons, module defaults). */
export function defaultsFor(fields: Fields, week: SiteWeek): Record<string, Json> {
  const out: Record<string, Json> = {}
  for (const [name, field] of Object.entries(fields)) {
    if (field.retired) continue
    const start = startValue(field, week)
    if (start !== undefined) out[name] = start
  }
  return out
}

/** Whether an entry is shown on `today`: the one end rule for listings, detail pages, URL maps and the sitemap. Dates inclusive, in the site's time zone. */
export function shownOn(brick: Brick, data: Record<string, unknown>, today: string): boolean {
  const last = shownUntil(brick, data)
  return last === undefined || last >= today
}

/**
 * The bundle without the entries that ended before `today` (`shownOn`): what a page or a server route reads on that
 * day. `buildBundle` already leaves out what ended before the day it ran, so this matters for a bundle from a cache,
 * read after midnight.
 */
export function shownBundle(bundle: Bundle, schema: Schema, today: string): Bundle {
  const bricks = Object.fromEntries(Object.entries(bundle.bricks).map(([key, value]) => {
    const def = schema.bricks[key]
    return [key, value.kind === 'collection' && def ? { ...value, items: value.items.filter((item) => shownOn(def, item.data, today)) } : value]
  }))
  return { ...bundle, bricks }
}

/**
 * The last day an entry is shown under `showUntil`: the date, or the end `to` of a daterange, plus `plusDays`.
 * `undefined` when the entry has no end: the brick has no `showUntil`, or the field is empty.
 */
export function shownUntil(brick: Brick, data: Record<string, unknown>): string | undefined {
  const rule = brick.kind === 'collection' ? brick.showUntil : undefined
  if (!rule) return undefined
  const value = data[rule.field]
  const last = typeof value === 'string' ? value : (value as { to?: unknown } | null | undefined)?.to
  return typeof last === 'string' ? addDays(last, rule.plusDays ?? 0) : undefined
}

/** Whether the platform deletes the entries of this brick that ended (`showUntil.thenDelete`). */
export const deletesEnded = (brick: Brick): boolean => brick.kind === 'collection' && brick.showUntil?.thenDelete === true

/**
 * The entries in the brick's order. With `languages`, a translatable field (a title) sorts by its text in `locale`,
 * else in the main language, so every language's list is in its own alphabetical order.
 */
export function sortEntries(brick: CollectionBrick, entries: StoredEntry[], languages?: { locale: Locale; main: Locale }): StoredEntry[] {
  const copy = [...entries]
  if (brick.order === 'manual') return copy.sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.id.localeCompare(b.id))
  const { field, dir } = brick.order
  const sign = dir === 'desc' ? -1 : 1
  const def = brick.fields[field]
  const translated = def !== undefined && isTranslatable(def)
  // Numbers and money compare numerically; daterange by from, then to; strings (dates, times) by code unit.
  // Empty values sort first in ascending order.
  const key = (e: StoredEntry): (number | string)[] => {
    let v = e.data[field] as unknown
    if (translated && languages && typeof v === 'object' && v !== null && !Array.isArray(v)) {
      const map = v as Partial<Record<Locale, Json>>
      v = isEmpty(map[languages.locale]) ? map[languages.main] : map[languages.locale]
    }
    if (v === undefined || v === null) return []
    if (typeof v === 'number') return [v]
    if (typeof v === 'object' && !Array.isArray(v) && 'amount' in v) return [Number((v as { amount: unknown }).amount)]
    if (typeof v === 'object' && !Array.isArray(v) && 'from' in v) return [String((v as { from: unknown }).from), String((v as { to?: unknown }).to)]
    return [typeof v === 'object' ? stableJson(v as Json) : String(v)]
  }
  const compare = (a: (number | string)[], b: (number | string)[]): number => {
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
      if (a[i] === undefined) return -1
      if (b[i] === undefined) return 1
      if (a[i]! < b[i]!) return -1
      if (a[i]! > b[i]!) return 1
    }
    return 0
  }
  return copy.sort((a, b) => sign * compare(key(a), key(b)) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
}

export interface BuildBundleInput {
  schema: Schema
  requestedLocale: string
  /** Not deleted entries per brick; singles have one entry (missing → built from defaults). */
  entries: Record<string, StoredEntry[]>
  files: (id: string) => FileInfo | undefined
  schemaRev: number
  contentRev: number
  generatedAt: string
  /** Today in the site's time zone (`todayIn`). */
  today: string
  /**
   * Keeps the entries that ended, without `urls` (an ended entry has no address, so a link to it stays broken). For the
   * link checks only, which read the links inside every live entry: an end date moved forward puts them online (D111).
   */
  keepEnded?: boolean
}

/**
 * The bundle a site receives: `buildBundle` with every Markdown text as its tree, its `$file.<id>` references
 * resolved to the files' URLs and its route links to paths. The platform's bundle endpoint, the Studio preview and
 * the contract fixtures all serve this, never `buildBundle` alone. In another language, links to entries left out of
 * it go to their main-language page (`resolveRouteLinks`).
 */
export async function servedBundle(input: BuildBundleInput): Promise<Bundle> {
  const bundle = buildBundle(input)
  const main = bundle.locale === bundle.mainLocale ? undefined : buildBundle({ ...input, requestedLocale: bundle.mainLocale })
  const trees = await withMarkdownTrees(bundle, input.schema)
  return resolveRouteLinks(resolveFileRefs(trees, input.schema, input.files), input.schema, main)
}

export function buildBundle(input: BuildBundleInput): Bundle {
  const { schema } = input
  const main = schema.locales[0]!
  const known = schema.locales.includes(input.requestedLocale as Locale)
  const locale = known ? (input.requestedLocale as Locale) : main
  const bricks: Record<string, BundleBrick> = {}
  for (const [key, brick] of Object.entries(schema.bricks)) {
    const stored = input.entries[key] ?? []
    const ctx: ResolveContext = { locale, markAllFallback: !known, files: input.files }
    if (brick.kind === 'single') {
      const entry = stored[0] ?? { id: `default:${key}`, data: defaultsFor(brick.fields, schema.week) }
      const r = resolveEntry(schema, key, entry, ctx)
      const upcoming = upcomingOf(schema, key, entry, ctx, input.today)
      bricks[key] = { kind: 'single', data: r.data, fallback: r.fallback, ...(upcoming ? { upcoming } : {}) }
      continue
    }
    const items: BundleItem[] = []
    for (const entry of sortEntries(brick, stored, { locale, main })) {
      const r = resolveEntry(schema, key, entry, ctx)
      // An entry outside its life is not in what a page gets, in files and on the platform alike (D111).
      const ended = !shownOn(brick, r.data, input.today)
      if (r.hidden || (ended && !input.keepEnded)) continue
      const item: BundleItem = { id: entry.id, data: r.data, fallback: r.fallback }
      // `data` holds the fields only; a file entry's old paths forward to its page in this language.
      if (entry.redirectFrom?.length) item.oldUrls = { [locale]: [...entry.redirectFrom] }
      if (entry.updatedAt !== undefined) item.updatedAt = entry.updatedAt
      // The file of this locale ("edit this page" opens the translation), else the main-language file.
      const source = entry.sources?.[locale] ?? entry.sources?.[main]
      if (source !== undefined) item.source = source
      if (brick.route && !ended) item.urls = urlsFor(schema, key, brick, entry)
      const upcoming = upcomingOf(schema, key, entry, ctx, input.today)
      if (upcoming) item.upcoming = upcoming
      items.push(item)
    }
    bricks[key] = { kind: 'collection', items }
  }
  return {
    format: BUNDLE_FORMAT,
    site: schema.site,
    locale,
    ...(known ? {} : { requestedLocale: input.requestedLocale }),
    locales: [...schema.locales],
    mainLocale: main,
    currency: schema.currency,
    schemaRev: input.schemaRev,
    contentRev: input.contentRev,
    generatedAt: input.generatedAt,
    bricks,
  }
}

/**
 * What a page may read ahead of an entry (D121): each change after `today` that sets a field of the brick's
 * `timeline.public`, with only those fields, resolved like the entry's own values. Undefined when there is none. A change
 * whose day comes after the entry's last shown day (`showUntil`) is left out: the entry is gone by then. The field
 * `showUntil` reads is one no change may set (`fixedFields`), so the stored value is the last day.
 */
export function upcomingOf(schema: Schema, key: string, entry: StoredEntry, ctx: ResolveContext, today: string): Upcoming[] | undefined {
  const brick = schema.bricks[key]!
  const shown = brick.timeline?.public
  if (!shown?.length || !entry.changes?.length) return undefined
  const last = shownUntil(brick, entry.data)
  const out: Upcoming[] = []
  for (const change of waitingChanges(entry.changes, today)) {
    if (last !== undefined && change.from > last) continue
    const names = Object.keys(change.set).filter((name) => shown.includes(name))
    if (!names.length) continue
    // Only the public values go into the resolver: nothing else of the change can reach the result.
    const values = Object.fromEntries(names.map((name) => [name, change.set[name]!]))
    const { data } = resolveEntry(schema, key, { id: entry.id, data: values }, ctx)
    out.push({ from: change.from, data: Object.fromEntries(names.map((name) => [name, Object.hasOwn(data, name) ? data[name] : null])) })
  }
  return out.length ? out : undefined
}

/**
 * Every locale's address of the entry from the route and slug (a locale without its own slug takes the main one),
 * translated or not: for cache refresh and URL clash checks.
 */
export function routeUrls(schema: Schema, brick: CollectionBrick, entry: StoredEntry): Partial<Record<Locale, string>> {
  const slugField = slugKeyOf(brick)
  if (!slugField || !brick.route) return {}
  const slugs = (entry.data[slugField] ?? {}) as Partial<Record<Locale, string>>
  const main = schema.locales[0]!
  const urls: Partial<Record<Locale, string>> = {}
  for (const locale of schema.locales) {
    const slug = slugs[locale] || slugs[main]
    const route = brick.route[locale]
    if (slug && route) urls[locale] = route.replace('[slug]', slug)
  }
  return urls
}

/**
 * The URLs where the entry is a page: `routeUrls` without the locales where it is untranslated, whatever the
 * mode. In `'fallback'` mode such an entry stays in that locale's lists but has no page there.
 */
export function urlsFor(schema: Schema, key: string, brick: CollectionBrick, entry: StoredEntry): Partial<Record<Locale, string>> {
  const urls = routeUrls(schema, brick, entry)
  const main = schema.locales[0]!
  // No files needed: only texts make an entry untranslated (image descriptions never do).
  for (const locale of schema.locales) {
    if (locale !== main && urls[locale] && resolveEntry(schema, key, entry, { locale, files: () => undefined }).blocking.length) delete urls[locale]
  }
  return urls
}

/** Two entries that resolve to the same URL in one locale. `first` comes earlier in the input. */
export interface UrlClash { url: string; locale: Locale; first: string; second: string }

/**
 * Entries that share a URL in one locale. Takes the `routeUrls` results of all entries (of all bricks:
 * two bricks with `route: '/[slug]'` clash too); this catches clashes that slugs alone miss, because
 * `routeUrls` lets a locale without its own slug fall back to the main slug. One clash per later entry and URL.
 */
export function urlClashes(entries: Iterable<{ id: string; urls: Partial<Record<Locale, string>> }>): UrlClash[] {
  const owner = new Map<string, string>()
  const clashes: UrlClash[] = []
  for (const { id, urls } of entries) {
    for (const [locale, url] of Object.entries(urls) as [Locale, string][]) {
      const key = `${locale}:${url}`
      const first = owner.get(key)
      if (first === undefined) owner.set(key, id)
      else if (first !== id) clashes.push({ url, locale, first, second: id })
    }
  }
  return clashes
}

/**
 * Slugs that brick `brickKey` must not take in `locale` because the URL would already belong to a
 * static page or to an entry of another brick. `takenByBrick` holds the slugs in use per brick key
 * (only bricks with a route matter). A URL of another owner blocks a slug when it has this brick's
 * route shape (same prefix and suffix around `[slug]`); the slug is the part in between.
 */
export function blockedSlugs(schema: Schema, brickKey: string, locale: Locale, takenByBrick: Record<string, Iterable<string>>): Set<string> {
  const mine = (schema.bricks[brickKey] as CollectionBrick | undefined)?.route?.[locale]
  const blocked = new Set<string>()
  if (!mine) return blocked
  const [prefix, suffix] = mine.split('[slug]') as [string, string]
  const take = (url: string) => {
    if (url.length > prefix.length + suffix.length && url.startsWith(prefix) && url.endsWith(suffix)) blocked.add(url.slice(prefix.length, url.length - suffix.length))
  }
  for (const paths of Object.values(schema.pages)) if (paths[locale]) take(paths[locale])
  for (const [key, brick] of Object.entries(schema.bricks)) {
    const route = brick.kind === 'collection' && !brick.retired ? brick.route?.[locale] : undefined
    if (key === brickKey || !route) continue
    for (const slug of takenByBrick[key] ?? []) take(route.replace('[slug]', slug))
  }
  return blocked
}

/**
 * The site's own view of a bundle (SPEC 8 "Defaults"): fields and bricks that the site's
 * config knows but the bundle lacks (released later, or retired on the platform) come from
 * their `default`, brought into bundle form by `resolveEntry`. A missing single is built from
 * defaults; a missing collection is empty. Bundle data always wins.
 */
export function applyDefaults(bundle: Bundle, schema: Schema): Bundle {
  const ctx: ResolveContext = { locale: bundle.locale, files: () => undefined }
  const fill = (key: string, fields: Fields, data: Record<string, unknown>, fallback: string[]) => {
    const missing: Record<string, Json> = {}
    for (const [name, field] of Object.entries(fields)) {
      if (!field.retired && field.default !== undefined && data[name] === undefined) missing[name] = field.default
    }
    if (!Object.keys(missing).length) return { data, fallback }
    const r = resolveEntry(schema, key, { id: `default:${key}`, data: missing }, ctx)
    return { data: { ...r.data, ...data }, fallback: [...fallback, ...r.fallback] }
  }
  const bricks: Record<string, BundleBrick> = { ...bundle.bricks }
  for (const [key, brick] of Object.entries(schema.bricks)) {
    if (brick.retired) continue
    const have = Object.hasOwn(bundle.bricks, key) ? bundle.bricks[key] : undefined
    if (brick.kind === 'single') {
      const base = have?.kind === 'single' ? have : { kind: 'single' as const, data: {}, fallback: [] }
      bricks[key] = { kind: 'single', ...fill(key, brick.fields, base.data, base.fallback) }
    } else {
      const items = have?.kind === 'collection' ? have.items : []
      bricks[key] = { kind: 'collection', items: items.map((item) => ({ ...item, ...fill(key, brick.fields, item.data, item.fallback) })) }
    }
  }
  return { ...bundle, bricks }
}
