// `defineSite`: the site file. It says which bricks exist (`bricks`), where their pages are (`pages`, `entries`) and
// who edits them (`studio`). It returns the site in its stored form (core/site.ts: `SiteInput`), so the schema, the
// checks, the CLI and the Nuxt module read one form only. Every brick is written with `single` or `collection` (the
// patterns and the presets are made that way); a brick in the stored form is refused with a sentence.
import type { RouteTemplate, SiteInput } from '../core/site.ts'
import type { Brick, CollectionBrick, Label, Locale, SingleBrick, Task } from '../core/types.ts'
import { DEF, type BrickDef, type CollectionDef, type SingleDef, type StandardTask, type TaskInput } from './bricks.ts'
import { entryWord, replaceTexts, standardLabel, translateBrick, withTexts, type BrickTexts, type StudioTexts } from './labels.ts'

type Path = `/${string}`
type EntryPath = `/${string}[slug]${string}`
/** One path for every language, or one path per language of the site. Written without the language prefix. */
type Address<L extends string, P extends string> = P | { [K in L]?: P }
/**
 * The page of one entry: one path for every language, or a path for each language (the stored form wants them all).
 * `null` says that the entries have an address field but no page.
 */
type EntryAddress<L extends string> = EntryPath | { [K in L]: EntryPath } | null

type SlugKeys<F> = { [K in keyof F]: F[K] extends { type: 'slug' } ? K : never }[keyof F]
/** The bricks that can have a page per entry: collections with a slug field. */
type WithEntryPage<B> = { [K in keyof B]: B[K] extends { kind: 'collection'; fields: infer F } ? ([SlugKeys<F>] extends [never] ? never : K) : never }[keyof B] & string

/** The stored-form brick a brick of the config becomes; `R` says that the site's `entries` has a line for it. */
type Compiled<X, R> =
  X extends SingleDef<infer F> ? SingleBrick<F>
  : X extends CollectionDef<infer F> ? CollectionBrick<F, R extends undefined ? undefined : Record<Locale, RouteTemplate>>
  : X
type CompiledBricks<B, E> = { [K in keyof B]: Compiled<B[K], K extends keyof E ? (E[K] extends null ? undefined : true) : undefined> }

/**
 * What `defineSite` returns: the site in its stored form, with the types of this config. A page of `pages` is a path
 * per language (with the prefix), so `site.pages.news.de` reads as in 0.18.
 */
type Site<B, L extends string, E, P> = Omit<SiteInput, 'bricks' | 'locales' | 'pages'> & {
  locales: readonly [L, ...L[]]
  pages: { [K in keyof P]: Partial<Record<L, string>> }
  bricks: CompiledBricks<B, E>
}

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
  const B extends Record<string, BrickDef>,
  const L extends string,
  const E extends Partial<Record<WithEntryPage<B>, EntryAddress<NoInfer<L>>>> = {},
  const P extends Record<string, Address<NoInfer<L>, Path>> = {},
>(site: Omit<SiteInput, Replaced> & {
  /** The site's languages. The first one is the main language. */
  locales: readonly [L, ...L[]]
  /** Which bricks exist. */
  bricks: B
  /**
   * The fixed pages by key, without the language prefix. A text is the same path in every language; an object has
   * exactly these languages: `{ home: '/', menu: { de: '/speisekarte', en: '/menu' } }`.
   */
  pages?: P
  /**
   * The page of one entry, by brick: a path with `[slug]`, the same in every language or one per language. Every
   * collection with an address field (`f.slug`) has a line here; `null` says that its entries have no page.
   */
  entries?: E & { [K in keyof E]: K extends WithEntryPage<B> ? unknown : never }
  /** Who edits what. Without it every brick lives in files. */
  studio?: StudioInput<keyof B & string>
  /** The texts of other editor languages: the content of `i18n/studio/<locale>.json`, by language. */
  texts?: Partial<Record<Locale, StudioTexts>>
}): Site<B, L, E, P> {
  const old = ['site', 'platform'].filter((key) => Object.hasOwn(site, key))
  if (old.length) {
    throw new Error([
      `ginko.config.ts is written in the form of Ginko 0.18 (it has \`${old.join('` and `')}\`).`,
      'Move it to the new form: write `studio: { id, url, bricks }` in place of `site` and `platform`, and see the upgrade guide in the docs.',
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

  // A ready-made brick is a function with options; given without its call it has no fields to read.
  const notCalled = Object.entries(bricks).filter(([, input]) => typeof input === 'function').map(([key]) => `bricks.${key} is a function. Call it: \`${key}: ${key}()\`.`)
  // A value that is no object (`undefined` from a conditional spread, a string, `true`) is no brick at all.
  const notBricks = Object.entries(bricks).filter(([, input]) => typeof input !== 'function' && (typeof input !== 'object' || input === null)).map(([key]) => `bricks.${key} is not a brick. Write it with single(...) or collection(...), or call a pattern.`)
  // A brick object of Ginko 0.18 (`collection()` of '@lupinum/ginko/internal', or an old preset) has no written form to read.
  const stored = Object.entries(bricks).filter(([, input]) => typeof input === 'object' && input !== null && !isDef(input)).map(([key]) => `bricks.${key} is a brick of the stored form (Ginko 0.18). Take its pattern from '@lupinum/ginko/patterns' or from the preset, or write it with \`single\` or \`collection\` of '@lupinum/ginko'.`)
  if (notCalled.length || notBricks.length || stored.length) throw new Error(`ginko.config.ts:\n${[...notCalled, ...notBricks, ...stored].map((p) => `- ${p}`).join('\n')}`)

  const compiled = Object.fromEntries(Object.entries(bricks).map(([key, input]) => {
    const own: Record<Locale, BrickTexts | undefined> = Object.fromEntries(Object.entries(texts).map(([locale, record]) => [locale, record?.[key]]))
    const text = (pick: (t: BrickTexts) => string | undefined) => Object.fromEntries(Object.entries(own).map(([locale, t]) => [locale, t ? pick(t) : undefined]))
    const label = withTexts(input.label, main, text((t) => t.label))
    const taskTexts = (id: string) => text((t) => t.tasks?.[id])
    let brick: Brick = compileBrick(key, input, label, input.item !== undefined ? withTexts(input.item, main, text((t) => t.item)) : undefined, main, taskTexts, problems)
    brick = translateBrick(key, brick, main, own, problems)
    // Where the brick lives is a fact of the site; the stored form keeps it as `source` on the brick.
    const { source: _source, ...withoutSource } = brick
    brick = inStudio(key) ? withoutSource : { ...withoutSource, source: 'files' }
    const entry = (entries as Record<string, string | Partial<Record<string, string>> | null | undefined>)[key]
    if (brick.kind === 'collection' && Object.values(brick.fields).some((field) => field.type === 'slug')) {
      // An address field without a page is nearly always a forgotten line (0.18 asked for `route` on the brick).
      if (entry === undefined) problems.push(`entries: “${key}” has an address field but no line here. Write \`${key}: '/${key}/[slug]'\` for a page per entry, or \`${key}: null\` for none.`)
      else if (entry !== null) brick = { ...brick, route: address(`entries.${key}`, entry) }
    }
    else if (entry !== undefined) problems.push(`entries.${key}: only a collection with an address field (\`f.slug\`) has a page per entry.`)
    return [key, brick]
  }))
  const storedPages = Object.fromEntries(Object.entries(pages as Record<string, string | Partial<Record<string, string>>>).map(([key, page]) => [key, address(`pages.${key}`, page)]))
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
  return out as Site<B, L, E, P>
}

const isDef = (brick: unknown): brick is BrickDef => (brick as { [DEF]?: true })[DEF] === true

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
  for (const [old, now] of Object.entries(MOVED)) if (Object.hasOwn(brick, old)) problems.push(`${key}.${old}: ${now}.`)
  const names = Object.keys(brick.fields)
  // The form of an edit task without `fields`: every field but the address. Measured on the example sites: of 17
  // tasks that edit a whole entry with an address field, 14 leave the address out (changing it breaks links).
  const editable = names.filter((name) => brick.fields[name]?.type !== 'slug')
  // The words in a standard task: `item` as written; without it "Eintrag" for a collection and the label for a single.
  const words = item ?? (brick.kind === 'collection' ? entryWord(main) : label)
  let tasks = brick.tasks?.map((task) => compileTask(key, task, brick, editable, words, main, taskTexts, problems))
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
    ...(brick.body !== undefined ? { body: brick.body } : {}),
    ...(brick.preview !== undefined ? { preview: brick.preview } : {}),
    ...(brick.layout ? { layout: brick.layout } : {}),
    ...(tasks ? { tasks } : {}),
    ...(planned ? { planned } : {}),
    ...(brick.timeline ? { timeline: { public: [...brick.timeline.public] } } : {}),
  }
  const status = brick.status as { show?: string; rule?: string } | undefined
  if (brick.kind === 'single') {
    // The rule's name and fields are checked with the schema (checkSchema), against the rules the caller knows.
    if (status && typeof status.rule !== 'string') problems.push(`${key}.status: write \`{ rule: '<name of a status rule>' }\`.`)
    return { kind: 'single', ...common, ...(brick.status ? { status: { rule: brick.status.rule, ...(brick.status.plans !== undefined ? { plans: brick.status.plans } : {}) } } : {}) }
  }
  if (status && typeof status.show !== 'string') problems.push(`${key}.status: write \`{ show: … }\`, such as \`{ show: 'next', field: 'when' }\`.`)
  const until = typeof brick.showUntil === 'string' ? { field: brick.showUntil } : brick.showUntil
  const line = brick.status
  return {
    kind: 'collection',
    ...common,
    max: brick.max ?? 500,
    order: brick.order ?? 'manual',
    // Required by type; a config without it reaches `checkSite`, which says what to write.
    listing: brick.listing,
    ...(brick.tree ? { tree: brick.tree } : {}),
    ...(until ? { showUntil: { field: until.field, ...(until.plusDays !== undefined ? { plusDays: until.plusDays } : {}), ...(until.thenDelete ? { thenDelete: true } : {}) } } : {}),
    ...(brick.untranslated ? { untranslated: brick.untranslated } : {}),
    ...(brick.publishedOn ? { publishedOn: brick.publishedOn } : {}),
    ...(brick.plans ? { plans: brick.plans } : {}),
    ...(line ? { status: line.show === 'next' ? { next: line.field } : line.show === 'ending' ? { count: true as const } : line.show === 'missing' ? { missing: line.field } : { age: line.field } } : {}),
  }
}

const isStandard = (id: string): id is StandardTask => id === 'add' || id === 'edit' || id === 'remove'

/** The stored task for a task as written: a short name, a changed standard task, or an own task. */
function compileTask(key: string, input: TaskInput, brick: BrickDef, editable: readonly string[], words: Label, main: Locale, taskTexts: (id: string) => Record<Locale, string | undefined>, problems: string[]): Task {
  const task = typeof input === 'string' ? { id: input } : input
  // 0.18 and the stored form say `create`; the written form has one word for it, `add`.
  if ((task.kind as string | undefined) === 'create') problems.push(`${key}.tasks.${task.id}: write \`kind: 'add'\`.`)
  const written = task.kind ?? (isStandard(task.id) ? task.id : 'edit')
  const kind = written === 'add' || (written as string) === 'create' ? 'create' as const : written
  // A standard label is made from the word for one entry; a text for the task in the label file replaces it.
  const label = task.label ?? replaceTexts(standardLabel(task.id as StandardTask, words, main), main, taskTexts(task.id))
  const approval = task.needsApproval ? { needsApproval: true } : {}
  if (task.when !== undefined && kind !== 'edit') problems.push(`${key}.tasks.${task.id}: when is only for an edit task.`)
  const when = task.when !== undefined && kind === 'edit' ? { when: { from: task.when.from } } : {}
  // The stored prefill is JSON (`serializeSchema` checks it against the fields).
  const prefill = task.prefill ? { prefill: task.prefill as Extract<Task, { kind: 'edit' }>['prefill'] } : {}
  if (kind === 'remove') return { id: task.id, label, kind, ...approval }
  if (kind === 'create') return { id: task.id, label, kind, ...(task.fields ? { fields: task.fields } : {}), ...prefill, ...approval }
  // An edit task on a collection first asks which entry.
  return { id: task.id, label, kind, ...(brick.kind === 'collection' ? { pick: true } : {}), fields: task.fields ?? editable, ...prefill, ...approval, ...when }
}
