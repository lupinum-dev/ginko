// A brick as a site developer writes it. `single` and `collection` only keep what was written; `defineSite` (site.ts)
// turns it into the stored form (core/types.ts), because the labels of the standard tasks need the site's languages
// and the texts of its label files.
import type { ValueInput } from '../core/fields.ts'
import type { CollectionListing, CollectionTree, Fields, Label } from '../core/types.ts'

/** Marks a brick written with `single` or `collection` of this entry. A symbol key, so it is never stored. */
export const DEF: unique symbol = Symbol.for('ginko.brick.def')

type FieldsOfType<F, T extends string> = { [K in keyof F]: F[K] extends { type: T } ? K : never }[keyof F] & string
/** A sentence as the expected type when a brick has no field of the kind a key needs. */
type Need<K extends string, Missing extends string> = [K] extends [never] ? Missing : K
type DateKey<F> = Need<FieldsOfType<F, 'date' | 'daterange'>, 'This brick has no date field'>
type DayKey<F> = Need<FieldsOfType<F, 'date'>, 'This brick has no date field'>
type MarkdownKey<F> = Need<FieldsOfType<F, 'markdown'>, 'This brick has no markdown field'>

/**
 * How an entry appears in the Studio's lists, pick lists and search: `title` names it (a text, longtext or date field),
 * `detail` is shown beside the name (such as a price or a date), `group` is a choice field that groups a pick list,
 * `image` a picture shown with it.
 */
export type ListingInput<F> = CollectionListing<
  Need<FieldsOfType<F, 'text' | 'longtext' | 'date'>, 'This brick has no text or date field'>,
  FieldsOfType<F, 'text' | 'longtext' | 'number' | 'money' | 'date' | 'daterange' | 'time' | 'choice' | 'choices' | 'boolean'>,
  FieldsOfType<F, 'choice'>,
  FieldsOfType<F, 'image'>
>

/**
 * The entries are pages of a navigation tree: `parent` is a ref field to the collection itself, `section` and `tab`
 * are text fields that start a heading or a tab at a top-level page.
 */
export type TreeInput<F> = CollectionTree<
  Need<FieldsOfType<F, 'ref'>, 'This brick has no ref field'>,
  FieldsOfType<F, 'text'>,
  FieldsOfType<F, 'text'>
>

/** The tasks every brick can have by their short name. `'add'` and `'remove'` are for collections. */
export type StandardTask = 'add' | 'edit' | 'remove'

/** Prefill values by field name, written like that field's value; `'@today'` on a date field is today. */
type Prefill<F extends Fields> = Fields extends F ? { readonly [name: string]: unknown } : { readonly [P in keyof F]?: ValueInput<F[P]> }

interface TaskOptions<F extends Fields> {
  /** What the task does: `'edit'` (default) changes an entry, `'add'` makes a new one, `'remove'` deletes one. The standard ids `add` and `remove` have their own kind. */
  kind?: 'edit' | 'add' | 'remove'
  /** The fields of the form. Default: all fields of the brick but the address (`f.slug`). */
  fields?: readonly (keyof F & string)[]
  /** Values set when the form opens. */
  prefill?: Prefill<F>
  /** A staff change waits for an owner's yes. */
  needsApproval?: boolean
}

/**
 * A task: a named, checked change to a brick. A standard one by its short name (`'add'`, `'edit'`, `'remove'`), a
 * changed standard one by its id (`{ id: 'edit', needsApproval: true }`), or an own one with `id` and `label`.
 */
export type TaskInput<F extends Fields = Fields> =
  | StandardTask
  | ({ id: StandardTask; label?: Label } & TaskOptions<F>)
  | ({ id: string; label: Label } & TaskOptions<F>)

/**
 * A planned change of one field: from the date in the date field `from` on, `next` replaces `field`. A task that
 * lists `field` shows `next` and `from` with it.
 */
type Planned<F> = { field: keyof F & string; next: keyof F & string; from: keyof F & string }

/** The entry is shown until the date in this field has passed; `plusDays` more days, `thenDelete` removes it after. */
export type ShowUntil<K extends string = string> = K | { field: K; plusDays?: number; thenDelete?: boolean }

/** The line of a collection on the Studio's Today page. */
export type CollectionStatusInput<D extends string = string, K extends string = string> =
  /** The next entry by its date field: "Next: Wine evening, Friday". */
  | { show: 'next'; field: D }
  /** How many entries are online and how many end soon. Needs `showUntil`. */
  | { show: 'ending' }
  /** How many entries have no value in this field. */
  | { show: 'missing'; field: K }
  /** The age of the newest entry by its date field. */
  | { show: 'newest'; field: D }
/** The line of a single on the Studio's Today page: today's opening hours; `plans` names the brick of planned hours. */
export type SingleStatusInput = { show: 'opening-hours'; plans?: string }

interface Common<F extends Fields> {
  /** The brick's name in the Studio. */
  label: Label
  /** One sentence below the name. */
  describe?: Label
  /**
   * The words for one entry (for a single: for the brick) as they stand in a task. The standard tasks are named with
   * them, and they are put in as written, in every language: `{ de: 'Leistung', en: 'a service', fr: 'une prestation' }`
   * gives "Leistung hinzufügen", "Add a service", "Ajouter une prestation". Without it a collection says "Eintrag" /
   * "an entry" and a single uses its label. A task with its own `label` does not use it.
   */
  item?: Label
  fields: F
  /** The markdown field that is the text of the brick's file (`content/<brick>.md`); other fields are its front matter. */
  body?: MarkdownKey<F>
  /** How the form groups its fields. Default `'sections'`. */
  layout?: 'sections' | 'tabs'
  /** The owner's buttons, in order; the first is the main one. A Studio brick with a task is on the Today page. */
  tasks?: readonly TaskInput<F>[]
  planned?: Planned<F>
}

export interface SingleInput<F extends Fields> extends Common<F> { status?: SingleStatusInput }

export interface CollectionInput<F extends Fields> extends Common<F> {
  /** How an entry appears in lists: `{ title: 'name', detail: 'price', group: 'category' }`. Only `title` is required. */
  listing: ListingInput<F>
  /** The entries are pages of a navigation tree: `{ parent: 'parent', section: 'section', tab: 'tab' }`. */
  tree?: TreeInput<F>
  /** Most entries. Default 500. */
  max?: number
  /** Default `'manual'`: the owner's order. */
  order?: 'manual' | { field: keyof F & string; dir?: 'asc' | 'desc' }
  showUntil?: ShowUntil<DateKey<F>>
  /**
   * A required translatable field is missing in a language: `'hide'` leaves the entry out there; `'fallback'` shows the
   * main language. Required when the site has more than one language.
   */
  untranslated?: 'fallback' | 'hide'
  /** Entries plan weeks of the single brick `brick`; `field` (a date field) holds the first day of the week. */
  plans?: { brick: string; field: DayKey<F> }
  status?: CollectionStatusInput<DateKey<F>, keyof F & string>
}

/** What `single` and `collection` return. The names in tasks and keys are typed by `F` where they are written and kept as plain names. */
interface Def<F extends Fields> { [DEF]: true; label: Label; describe?: Label; item?: Label; fields: F; body?: string; layout?: 'sections' | 'tabs'; tasks?: readonly TaskInput[]; planned?: Planned<Fields> }
export interface SingleDef<F extends Fields = Fields> extends Def<F> { kind: 'single'; status?: SingleStatusInput }
export interface CollectionDef<F extends Fields = Fields> extends Def<F> {
  kind: 'collection'
  listing: CollectionListing
  tree?: CollectionTree
  max?: number
  order?: 'manual' | { field: string; dir?: 'asc' | 'desc' }
  showUntil?: ShowUntil
  untranslated?: 'fallback' | 'hide'
  plans?: { brick: string; field: string }
  status?: CollectionStatusInput
}
export type BrickDef = SingleDef | CollectionDef

/** A brick with one entry, such as the home page or the contact details. */
export function single<const F extends Fields>(input: SingleInput<F>): SingleDef<F> {
  // The names in tasks and `planned` are typed by `F` in the input and kept as plain names.
  return { [DEF]: true, kind: 'single', ...input } as SingleDef<F>
}

/** A brick with many entries, such as posts, events or dishes. */
export function collection<const F extends Fields>(input: CollectionInput<F>): CollectionDef<F> {
  return { [DEF]: true, kind: 'collection', ...input } as CollectionDef<F>
}

/** The fields of a brick plus the added ones. Without added fields TypeScript infers `G` as all `Fields`: then it is `F`. */
type Merge<F, G> = Fields extends G ? F : { [K in keyof F | keyof G]: K extends keyof G ? G[K] : K extends keyof F ? F[K] : never }

/**
 * A ready-made brick with your changes: another label or word for one entry, more fields, other tasks, another line
 * on Today. Fields are added, never replaced; `tasks` replaces the brick's tasks and may name the added fields.
 *
 * ```ts
 * jobs: extend(jobs(), {
 *   fields: { team: f.text('Team', { optional: true }) },
 *   tasks: ['add', 'edit', { id: 'team', label: 'Team ändern', fields: ['team'] }, 'remove'],
 * })
 * ```
 */
export function extend<const F extends Fields, const G extends Fields = {}>(
  brick: SingleDef<F>,
  change: { label?: Label; describe?: Label; item?: Label; fields?: G; tasks?: readonly TaskInput<Merge<F, G>>[]; status?: SingleStatusInput },
): SingleDef<Merge<F, G>>
export function extend<const F extends Fields, const G extends Fields = {}>(
  brick: CollectionDef<F>,
  change: {
    label?: Label
    describe?: Label
    item?: Label
    fields?: G
    tasks?: readonly TaskInput<Merge<F, G>>[]
    status?: CollectionStatusInput<DateKey<Merge<F, G>>, keyof Merge<F, G> & string>
  },
): CollectionDef<Merge<F, G>>
export function extend(brick: BrickDef, change: { label?: Label; describe?: Label; item?: Label; fields?: Fields; tasks?: readonly TaskInput[]; status?: object }): BrickDef {
  if (typeof brick === 'function') throw new Error('extend: the first argument is a function. Call it: `extend(posts({ authors: \'people\' }), { … })`.')
  if ((brick as { [DEF]?: true })[DEF] !== true) throw new Error('extend: the first argument is a brick made with `single` or `collection` of \'@lupinum/ginko\', such as a brick of \'@lupinum/ginko/patterns\'.')
  const { fields, ...rest } = change
  const twice = Object.keys(fields ?? {}).filter((name) => Object.hasOwn(brick.fields, name))
  if (twice.length) throw new Error(`extend: the brick already has the field${twice.length > 1 ? 's' : ''} ${twice.join(', ')}. \`extend\` adds fields; it does not replace one.`)
  const given = Object.fromEntries(Object.entries(rest).filter(([, value]) => value !== undefined))
  return { ...brick, ...given, fields: { ...brick.fields, ...fields } } as BrickDef
}
