// `defineSite`: the site file. It says which bricks exist (`bricks`), where their pages are (`pages`, `entries`) and
// who edits them (`studio`). It returns the site in its stored form (core/site.ts: `SiteInput`), so the schema, the
// checks, the CLI and the Nuxt module read one form only.
//
// A brick in the stored form (made with '@lupinum/ginko/v1', or by a preset that still uses it) may stand next to
// bricks written with this entry: the site file then sets where it lives and, with `entries`, its address.
import type { RouteTemplate, SiteInput } from '../core/site.ts'
import type { Brick, CollectionBrick, Label, Locale, SingleBrick, Task } from '../core/types.ts'
import { DEF, type BrickDef, type CollectionDef, type SingleDef, type StandardTask, type TaskInput } from './bricks.ts'
import { entryWord, replaceTexts, standardLabel, translateBrick, withTexts, type BrickTexts, type StudioTexts } from './labels.ts'

type Path = `/${string}`
type EntryPath = `/${string}[slug]${string}`
/** One path for every language, or one path per language of the site. Written without the language prefix. */
type Address<L extends string, P extends string> = P | { [K in L]?: P }
/** The page of one entry: one path for every language, or a path for each language (the stored form wants them all). */
type EntryAddress<L extends string> = EntryPath | { [K in L]: EntryPath }

type SlugKeys<F> = { [K in keyof F]: F[K] extends { type: 'slug' } ? K : never }[keyof F]
/** The bricks that can have a page per entry: collections with a slug field. */
type WithEntryPage<B> = { [K in keyof B]: B[K] extends { kind: 'collection'; fields: infer F } ? ([SlugKeys<F>] extends [never] ? never : K) : never }[keyof B] & string

/** The stored-form brick a brick of the config becomes; `R` says that the site's `entries` has a line for it. */
type Compiled<X, R> =
  X extends SingleDef<infer F> ? SingleBrick<F>
  : X extends CollectionDef<infer F> ? CollectionBrick<F, R extends undefined ? undefined : Record<Locale, RouteTemplate>>
  : X extends CollectionBrick<infer F, infer R0> ? CollectionBrick<F, R extends undefined ? R0 : Record<Locale, RouteTemplate>>
  : X
type CompiledBricks<B, E> = { [K in keyof B]: Compiled<B[K], K extends keyof E ? true : undefined> }

/** The site keys that are written in another way than they are stored. */
type Replaced = 'site' | 'platform' | 'pages' | 'bricks' | 'locales'

export interface StudioInput<K extends string = string> {
  /** The site's id on the platform: letters, digits and `-`. */
  id: string
  /** The Studio's address, such as `https://cms.example.com`. `NUXT_PUBLIC_GINKO_PLATFORM` overrides it. */
  url?: string
  /** The bricks the owner edits in the Studio, or `'all'`. Every other brick lives in files. */
  bricks: readonly K[] | 'all'
}

export function defineSite<
  const B extends Record<string, Brick | BrickDef>,
  const L extends string,
  const E extends Partial<Record<WithEntryPage<B>, EntryAddress<NoInfer<L>>>> = {},
>(site: Omit<SiteInput, Replaced> & {
  /** The site's languages. The first one is the main language. */
  locales: readonly [L, ...L[]]
  /** Which bricks exist. */
  bricks: B
  /**
   * The fixed pages by key, without the language prefix. A text is the same path in every language; an object has
   * exactly these languages: `{ home: '/', menu: { de: '/speisekarte', en: '/menu' } }`.
   */
  pages?: Record<string, Address<NoInfer<L>, Path>>
  /** The page of one entry, by brick: a path with `[slug]`, the same in every language or one per language. Only collections with a slug field. */
  entries?: E & { [K in keyof E]: K extends WithEntryPage<B> ? unknown : never }
  /** Who edits what. Without it every brick lives in files. */
  studio?: StudioInput<keyof B & string>
  /** The texts of other editor languages: the content of `i18n/studio/<locale>.json`, by language. */
  texts?: Partial<Record<Locale, StudioTexts>>
}): Omit<SiteInput, 'bricks' | 'locales'> & { locales: readonly [L, ...L[]]; bricks: CompiledBricks<B, E> } {
  const old = ['site', 'platform'].filter((key) => Object.hasOwn(site, key))
  if (old.length) {
    throw new Error([
      `ginko.config.ts is written in the form of Ginko 0.18 (it has \`${old.join('` and `')}\`).`,
      'To keep it as it is, change the import in the config and in your brick files:',
      '  import { defineSite, single, collection, f } from \'@lupinum/ginko/v1\'',
      'To move it to the new form, write `studio: { id, url, bricks }` and see "Update to 0.19" in the docs.',
    ].join('\n'))
  }
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
  const address = (where: string, value: string | Partial<Record<string, string>>) => addressOf(where, value, site.locales, problems)

  const compiled = Object.fromEntries(Object.entries(bricks).map(([key, input]) => {
    const own: Record<Locale, BrickTexts | undefined> = Object.fromEntries(Object.entries(texts).map(([locale, record]) => [locale, record?.[key]]))
    const text = (pick: (t: BrickTexts) => string | undefined) => Object.fromEntries(Object.entries(own).map(([locale, t]) => [locale, t ? pick(t) : undefined]))
    const label = withTexts(input.label, main, text((t) => t.label))
    const taskTexts = (id: string) => text((t) => t.tasks?.[id])
    let brick: Brick = isDef(input)
      ? compileBrick(key, input, label, input.kind === 'collection' && input.item !== undefined ? withTexts(input.item, main, text((t) => t.item)) : undefined, main, taskTexts, problems)
      : { ...input, label }
    brick = translateBrick(key, brick, main, own, problems)
    // Where the brick lives is a fact of the site; the stored form keeps it as `source` on the brick.
    const { source: _source, ...withoutSource } = brick
    brick = inStudio(key) ? withoutSource : { ...withoutSource, source: 'files' }
    const entry = (entries as Record<string, string | Partial<Record<string, string>> | undefined>)[key]
    if (entry !== undefined) {
      if (brick.kind !== 'collection' || !Object.values(brick.fields).some((field) => field.type === 'slug')) problems.push(`entries.${key}: only a collection with a slug field has a page per entry.`)
      else if (brick.route) problems.push(`entries.${key}: the brick already has a \`route\`. Write the address in one place.`)
      else brick = { ...brick, route: address(`entries.${key}`, entry) }
    }
    return [key, brick]
  }))
  const storedPages = Object.fromEntries(Object.entries(pages).map(([key, page]) => [key, address(`pages.${key}`, page)]))
  if (problems.length) throw new Error(`ginko.config.ts:\n${problems.map((p) => `- ${p}`).join('\n')}`)
  const out = {
    ...rest,
    // The stored form has an id for every site. A site without a Studio gets one from its name.
    site: studio?.id ?? slugOf(site.name),
    ...(studio?.url ? { platform: studio.url } : {}),
    pages: storedPages,
    bricks: compiled,
  }
  // The compiled bricks are built by key at runtime; their types are computed from `B` and `E` above.
  return out as Omit<SiteInput, 'bricks' | 'locales'> & { locales: readonly [L, ...L[]]; bricks: CompiledBricks<B, E> }
}

const isDef = (brick: Brick | BrickDef): brick is BrickDef => (brick as { [DEF]?: true })[DEF] === true

/** `Halden Pumps` → `halden-pumps`: letters, digits and `-`, as a site id is written. */
function slugOf(name: string): string {
  const slug = name.normalize('NFKD').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40)
  return /^[a-z]/.test(slug) ? slug : `site-${slug}`.slice(0, 40)
}

/** An address as it is stored: a path per language, with `/<locale>` in front for every language but the main one. */
function addressOf(where: string, value: string | Partial<Record<string, string>>, locales: readonly string[], problems: string[]): Record<string, string> {
  const main = locales[0]
  const withPrefix = (locale: string, path: string) => (locale === main ? path : path === '/' ? `/${locale}` : `/${locale}${path}`)
  const paths = typeof value === 'string' ? Object.fromEntries(locales.map((locale) => [locale, value])) : value
  const out: Record<string, string> = {}
  for (const [locale, path] of Object.entries(paths)) {
    if (typeof path !== 'string') continue
    if (!locales.includes(locale)) problems.push(`${where}: “${locale}” is not a language of the site (locales).`)
    // 0.18 wrote `/en/menu`; a path that starts with its own language is that form, not a page `/en/en/menu`.
    else if (locale !== main && typeof value !== 'string' && (path === `/${locale}` || path.startsWith(`/${locale}/`))) problems.push(`${where}.${locale}: write the path without the language prefix (“${path.slice(locale.length + 1) || '/'}”). Ginko adds “/${locale}”.`)
    else out[locale] = withPrefix(locale, path)
  }
  return out
}

/** Keys of a 0.18 brick, with the place where the new form writes them. */
const MOVED: Record<string, string> = {
  source: 'where a brick lives is `studio.bricks` in the site file',
  route: 'the address of an entry is `entries` in the site file',
  visible: 'write `showUntil`',
}

/** The stored-form brick for a brick as written. */
function compileBrick(key: string, brick: BrickDef, label: Label, item: Label | undefined, main: Locale, taskTexts: (id: string) => Record<Locale, string | undefined>, problems: string[]): Brick {
  for (const [old, now] of Object.entries(MOVED)) if (Object.hasOwn(brick, old)) problems.push(`${key}.${old}: ${now}. (To keep a brick of 0.18 as it is, import from '@lupinum/ginko/v1'.)`)
  const names = Object.keys(brick.fields)
  // The form of an edit task without `fields`: every field but the address. Measured on the example sites: of 17
  // tasks that edit a whole entry with an address field, 14 leave the address out (changing it breaks links).
  const editable = names.filter((name) => brick.fields[name]?.type !== 'slug')
  const noun = brick.kind === 'collection' ? item ?? entryWord(main) : label
  let tasks = brick.tasks?.map((task) => compileTask(task, brick, editable, noun, main, taskTexts))
  // The plan of a planned field is shown in every edit task that changes the field; the stored task lists it.
  const planned = brick.planned
  if (planned && tasks) {
    tasks = tasks.map((task) => (task.kind === 'edit' && task.fields.includes(planned.field)
      ? { ...task, fields: [...task.fields, ...[planned.next, planned.from].filter((name) => !task.fields.includes(name))] }
      : task))
  }
  const common = {
    label,
    ...(brick.describe !== undefined ? { describe: brick.describe } : {}),
    fields: brick.fields,
    ...(brick.layout ? { layout: brick.layout } : {}),
    ...(tasks ? { tasks } : {}),
    ...(planned ? { planned } : {}),
  }
  const status = brick.status as { show?: string } | undefined
  if (status && typeof status.show !== 'string') problems.push(`${key}.status: write \`{ show: … }\`, such as \`{ show: 'next', field: 'when' }\`.`)
  if (brick.kind === 'single') {
    return { kind: 'single', ...common, ...(brick.status ? { status: { hours: brick.status.plans ? { plans: brick.status.plans } : true as const } } : {}) }
  }
  const until = typeof brick.showUntil === 'string' ? { field: brick.showUntil } : brick.showUntil
  const line = brick.status
  return {
    kind: 'collection',
    ...common,
    max: brick.max ?? 500,
    order: brick.order ?? 'manual',
    ...(until ? { visible: { mode: 'until' as const, field: until.field, ...(until.plusDays !== undefined ? { days: until.plusDays } : {}), ...(until.thenDelete ? { deleteExpired: true } : {}) } } : {}),
    ...(brick.untranslated ? { untranslated: brick.untranslated } : {}),
    ...(brick.plans ? { plans: brick.plans } : {}),
    ...(line ? { status: line.show === 'next' ? { next: line.field } : line.show === 'ending' ? { count: true as const } : line.show === 'missing' ? { missing: line.field } : { age: line.field } } : {}),
  }
}

const STANDARD_KIND = { add: 'create', edit: 'edit', remove: 'remove' } as const
const isStandard = (id: string): id is StandardTask => Object.hasOwn(STANDARD_KIND, id)

/** The stored task for a task as written: a short name, a changed standard task, or an own task. */
function compileTask(input: TaskInput, brick: BrickDef, editable: readonly string[], noun: Label, main: Locale, taskTexts: (id: string) => Record<Locale, string | undefined>): Task {
  const task = typeof input === 'string' ? { id: input } : input
  const kind = task.kind ?? (isStandard(task.id) ? STANDARD_KIND[task.id] : 'edit')
  // A standard label is made from the word for one entry; a text for the task in the label file replaces it.
  const label = task.label ?? replaceTexts(standardLabel(task.id as StandardTask, noun, main, brick.kind === 'collection'), main, taskTexts(task.id))
  const approval = task.needsApproval ? { needsApproval: true } : {}
  // The stored prefill is JSON (`serializeSchema` checks it against the fields).
  const prefill = task.prefill ? { prefill: task.prefill as Extract<Task, { kind: 'edit' }>['prefill'] } : {}
  if (kind === 'remove') return { id: task.id, label, kind, ...approval }
  if (kind === 'create') return { id: task.id, label, kind, ...(task.fields ? { fields: task.fields } : {}), ...prefill, ...approval }
  // An edit task on a collection first asks which entry.
  return { id: task.id, label, kind, ...(brick.kind === 'collection' ? { pick: true } : {}), fields: task.fields ?? editable, ...prefill, ...approval }
}
