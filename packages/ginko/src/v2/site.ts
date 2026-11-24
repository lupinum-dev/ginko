// POC T2 (v2 spec, sections 5, 6, 8, 9, 10): `defineSite` in the v2 form. It returns the v1 site object, so
// `serializeSchema`, `checkSite`, the CLI and the Nuxt module read a v2 config as they read a v1 config.
//
// The site file says which bricks exist (`bricks`), where their pages are (`pages`, `entries`) and who edits them
// (`studio`). A brick written with v1 (`@lupinum/ginko/basics`, a preset) may stand next to v2 bricks.
import type { RouteTemplate, SiteInput } from '../core/site.ts'
import type { Brick, CollectionBrick, Label, Locale, SingleBrick, Task } from '../core/types.ts'
import { V2, type BrickV2, type CollectionV2, type SingleV2, type StandardTask, type TaskInput } from './bricks.ts'
import { entryWord, standardLabel, translateBrick, withTexts, type BrickTexts, type StudioTexts } from './labels.ts'

type Path = `/${string}`
type EntryPath = `/${string}[slug]${string}`
/** One path for every language, or one path per language of the site. Written without the language prefix. */
type Address<L extends string, P extends string> = P | { [K in L]?: P }

type SlugKeys<F> = { [K in keyof F]: F[K] extends { type: 'slug' } ? K : never }[keyof F]
/** The bricks that can have a page per entry: collections with a slug field. */
type WithEntryPage<B> = { [K in keyof B]: B[K] extends { kind: 'collection'; fields: infer F } ? ([SlugKeys<F>] extends [never] ? never : K) : never }[keyof B] & string

/** The v1 brick a brick of the config becomes; `R` is its route when the site's `entries` has a line for it. */
type Compiled<X, R> =
  X extends SingleV2<infer F> ? SingleBrick<F>
  : X extends CollectionV2<infer F> ? CollectionBrick<F, R extends undefined ? undefined : Record<Locale, RouteTemplate>>
  : X extends CollectionBrick<infer F, infer R0> ? CollectionBrick<F, R extends undefined ? R0 : Record<Locale, RouteTemplate>>
  : X
type CompiledBricks<B, E> = { [K in keyof B]: Compiled<B[K], K extends keyof E ? true : undefined> }

/** The site keys that v2 writes in another way. */
type Replaced = 'site' | 'platform' | 'pages' | 'bricks' | 'locales'

export interface StudioInput<K extends string = string> {
  /** The site's id on the platform. v1: `site`. */
  id: string
  /** The Studio's address. v1: `platform`. */
  url?: string
  /** The bricks the owner edits in the Studio, or `'all'`. Every other brick lives in files. */
  bricks: readonly K[] | 'all'
}

export function defineSite<
  const B extends Record<string, Brick | BrickV2>,
  const L extends string,
  const E extends Partial<Record<WithEntryPage<B>, Address<NoInfer<L>, EntryPath>>> = {},
>(site: Omit<SiteInput, Replaced> & {
  /** The site's languages. The first one is the main language. */
  locales: readonly [L, ...L[]]
  /** Which bricks exist. */
  bricks: B
  /** The fixed pages by key. A text is the same path in every language; an object has exactly these languages. */
  pages?: Record<string, Address<NoInfer<L>, Path>>
  /** The page of one entry, by brick: a path with `[slug]`. Only collections with a slug field. */
  entries?: E & { [K in keyof E]: K extends WithEntryPage<B> ? unknown : never }
  /** Who edits what. Without it every brick lives in files. */
  studio?: StudioInput<keyof B & string>
  /** The texts of other editor languages: the content of `i18n/studio/<locale>.json`, by language. */
  texts?: Partial<Record<Locale, StudioTexts>>
}): Omit<SiteInput, 'bricks' | 'locales'> & { locales: readonly [L, ...L[]]; bricks: CompiledBricks<B, E> } {
  const { bricks, pages = {}, entries = {}, studio, texts = {}, ...rest } = site
  const main: Locale = site.locales[0]
  const problems: string[] = []
  const keys = Object.keys(bricks)
  for (const [locale, record] of Object.entries(texts)) {
    for (const key of Object.keys(record ?? {})) if (!keys.includes(key)) problems.push(`i18n/studio/${locale}.json: ${key} names no brick.`)
  }
  if (studio && studio.bricks !== 'all') for (const key of studio.bricks) if (!keys.includes(key)) problems.push(`studio.bricks: “${key}” names no brick.`)
  for (const key of Object.keys(entries)) if (!keys.includes(key)) problems.push(`entries: “${key}” names no brick.`)
  const inStudio = (key: string) => studio !== undefined && (studio.bricks === 'all' || studio.bricks.includes(key as keyof B & string))
  const address = (value: string | Partial<Record<string, string>>) => addressOf(value, site.locales)

  const compiled = Object.fromEntries(Object.entries(bricks).map(([key, input]) => {
    const own: Record<Locale, BrickTexts | undefined> = Object.fromEntries(Object.entries(texts).map(([locale, record]) => [locale, record?.[key]]))
    const text = (pick: (t: BrickTexts) => string | undefined) => Object.fromEntries(Object.entries(own).map(([locale, t]) => [locale, t ? pick(t) : undefined]))
    const label = withTexts(input.label, main, text((t) => t.label))
    const taskTexts = (id: string) => text((t) => t.tasks?.[id])
    let brick: Brick = isV2(input)
      ? compileBrick(key, input, label, input.kind === 'collection' && input.item !== undefined ? withTexts(input.item, main, text((t) => t.item)) : undefined, main, taskTexts, problems)
      : { ...input, label }
    brick = translateBrick(key, brick, main, own, problems)
    // Where the brick lives is a fact of the site: v1 stores it as `source` on the brick.
    const { source: _source, ...withoutSource } = brick
    brick = inStudio(key) ? withoutSource : { ...withoutSource, source: 'files' }
    const entry = (entries as Record<string, string | Partial<Record<string, string>> | undefined>)[key]
    if (entry !== undefined) {
      if (brick.kind !== 'collection' || !Object.values(brick.fields).some((field) => field.type === 'slug')) problems.push(`entries.${key}: only a collection with a slug field has a page per entry.`)
      else if (brick.route) problems.push(`entries.${key}: the brick already has a \`route\`. Write the address in one place.`)
      else brick = { ...brick, route: address(entry) }
    }
    return [key, brick]
  }))
  if (problems.length) throw new Error(`ginko.config.ts:\n${problems.map((p) => `- ${p}`).join('\n')}`)
  const out = {
    ...rest,
    // v1 needs an id for every site. A site without a Studio gets one from its name.
    site: studio?.id ?? slugOf(site.name),
    ...(studio?.url ? { platform: studio.url } : {}),
    pages: Object.fromEntries(Object.entries(pages).map(([key, page]) => [key, address(page)])),
    bricks: compiled,
  }
  // The compiled bricks are built by key at runtime; their types are computed from `B` and `E` above.
  return out as Omit<SiteInput, 'bricks' | 'locales'> & { locales: readonly [L, ...L[]]; bricks: CompiledBricks<B, E> }
}

const isV2 = (brick: Brick | BrickV2): brick is BrickV2 => (brick as { [V2]?: true })[V2] === true

/** `Halden Pumps` → `halden-pumps`: letters, digits and `-`, as v1 wants a site id. */
function slugOf(name: string): string {
  const slug = name.normalize('NFKD').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40)
  return /^[a-z]/.test(slug) ? slug : `site-${slug}`.slice(0, 40)
}

/** A v2 address as v1 stores it: a path per language, with `/<locale>` in front for every language but the main one. */
function addressOf(value: string | Partial<Record<string, string>>, locales: readonly string[]): Record<string, string> {
  const main = locales[0]
  const withPrefix = (locale: string, path: string) => (locale === main ? path : path === '/' ? `/${locale}` : `/${locale}${path}`)
  const paths = typeof value === 'string' ? Object.fromEntries(locales.map((locale) => [locale, value])) : value
  return Object.fromEntries(Object.entries(paths).filter((entry): entry is [string, string] => typeof entry[1] === 'string').map(([locale, path]) => [locale, withPrefix(locale, path)]))
}

/** The v1 brick for a brick written in v2. */
function compileBrick(key: string, brick: BrickV2, label: Label, item: Label | undefined, main: Locale, taskTexts: (id: string) => Record<Locale, string | undefined>, problems: string[]): Brick {
  const names = Object.keys(brick.fields)
  // The form of an edit task without `fields`: every field but the address. Measured on the 14 examples: of 17 tasks
  // that edit a whole entry with an address field, 14 leave the address out (changing it breaks links).
  const editable = names.filter((name) => brick.fields[name]?.type !== 'slug')
  const noun = brick.kind === 'collection' ? item ?? entryWord(main) : label
  let tasks = brick.tasks?.map((task) => compileTask(task, brick, editable, noun, main, taskTexts))
  // v1 shows the plan of a planned field in every edit task that changes the field, and wants it listed there.
  const planned = brick.planned
  if (planned && tasks) {
    tasks = tasks.map((task) => (task.kind === 'edit' && task.fields.includes(planned.field)
      ? { ...task, fields: [...task.fields, ...[planned.next, planned.from].filter((name) => !task.fields.includes(name))] }
      : task))
  }
  // v1 knows weekly content by the first edit task that prefills a date with '@workWeek'.
  const repeats = brick.repeats
  if (repeats) {
    const at = tasks?.findIndex((task) => task.kind === 'edit' && task.fields.includes(repeats.start)) ?? -1
    if (repeats.every !== 'week' || repeats.workWeek !== true) problems.push(`${key}.repeats: v1 stores only the weekly work week (every: 'week', workWeek: true). The other forms are POC T5.`)
    else if (at < 0 || !tasks) problems.push(`${key}.repeats: needs an edit task whose fields include “${repeats.start}”.`)
    else tasks = tasks.map((task, i) => (i === at && task.kind === 'edit' ? { ...task, prefill: { ...task.prefill, [repeats.start]: '@workWeek' } } : task))
  }
  const common = {
    label,
    ...(brick.describe !== undefined ? { describe: brick.describe } : {}),
    fields: brick.fields,
    ...(brick.layout ? { layout: brick.layout } : {}),
    ...(tasks ? { tasks } : {}),
    ...(planned ? { planned } : {}),
  }
  if (brick.kind === 'single') {
    return { kind: 'single', ...common, ...(brick.status ? { status: { hours: brick.status.plans ? { plans: brick.status.plans } : true as const } } : {}) }
  }
  const firstText = names.find((name) => brick.fields[name]?.type === 'text')
  if (brick.title !== undefined && brick.title !== firstText) problems.push(`${key}.title: v1 names an entry by its first text field (“${firstText}”). Another field needs a stored key, which is not part of POC T2.`)
  const until = typeof brick.showUntil === 'string' ? { field: brick.showUntil } : brick.showUntil
  const status = brick.status
  return {
    kind: 'collection',
    ...common,
    max: brick.max ?? 500,
    order: brick.order ?? 'manual',
    ...(until ? { visible: { mode: 'until' as const, field: until.field, ...(until.plusDays !== undefined ? { days: until.plusDays } : {}), ...(until.thenDelete ? { deleteExpired: true } : {}) } } : {}),
    ...(brick.untranslated ? { untranslated: brick.untranslated } : {}),
    ...(brick.plans ? { plans: brick.plans } : {}),
    ...(status ? { status: status.show === 'next' ? { next: status.field } : status.show === 'ending' ? { count: true as const } : status.show === 'missing' ? { missing: status.field } : { age: status.field } } : {}),
  }
}

/** `label` with `texts` in place of its own texts for those languages (`withTexts` keeps the label's own). */
function replaceTexts(label: Label, main: Locale, texts: Record<Locale, string | undefined>): Label {
  const given = Object.fromEntries(Object.entries(texts).filter((entry): entry is [string, string] => typeof entry[1] === 'string'))
  if (Object.keys(given).length === 0) return label
  return { ...(typeof label === 'string' ? { [main]: label } : label), ...given }
}

const STANDARD_KIND = { add: 'create', edit: 'edit', remove: 'remove' } as const
const isStandard = (id: string): id is StandardTask => Object.hasOwn(STANDARD_KIND, id)

/** The v1 task for a v2 task: a short name, a changed standard task, or an own task. */
function compileTask(input: TaskInput, brick: BrickV2, editable: readonly string[], noun: Label, main: Locale, taskTexts: (id: string) => Record<Locale, string | undefined>): Task {
  const task = typeof input === 'string' ? { id: input } : input
  const kind = task.kind ?? (isStandard(task.id) ? STANDARD_KIND[task.id] : 'edit')
  // A standard label is made from the word for one entry; a text for the task in `i18n/studio/<locale>.json` replaces it.
  const label = task.label ?? replaceTexts(standardLabel(task.id as StandardTask, noun, main), main, taskTexts(task.id))
  const approval = task.needsApproval ? { needsApproval: true } : {}
  // The stored prefill is JSON (v1 `storedPrefill` checks it against the fields when the schema is serialized).
  const prefill = task.prefill ? { prefill: task.prefill as Extract<Task, { kind: 'edit' }>['prefill'] } : {}
  if (kind === 'remove') return { id: task.id, label, kind, ...approval }
  if (kind === 'create') return { id: task.id, label, kind, ...(task.fields ? { fields: task.fields } : {}), ...prefill, ...approval }
  // An edit task on a collection first asks which entry (v1: `pick: true`, which every such task sets).
  return { id: task.id, label, kind, ...(brick.kind === 'collection' ? { pick: true } : {}), fields: task.fields ?? editable, ...prefill, ...approval }
}
