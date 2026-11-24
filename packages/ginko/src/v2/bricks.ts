// POC T2 (v2 spec, sections 6, 8, 9, 10): the v2 form of a brick. `single` and `collection` only keep what was written;
// `defineSite` (site.ts) turns it into the v1 brick, because short tasks need the site's languages and translations.
import type { ValueInput } from '../core/fields.ts'
import type { Fields, Label } from '../core/types.ts'

/** Marks a brick written in the v2 form. A symbol key, so it is never stored. */
export const V2: unique symbol = Symbol.for('ginko.v2.brick')

type FieldsOfType<F, T extends string> = { [K in keyof F]: F[K] extends { type: T } ? K : never }[keyof F] & string
/** A sentence as the expected type when a brick has no field of the kind a key needs. */
type Need<K extends string, Missing extends string> = [K] extends [never] ? Missing : K
type DateKey<F> = Need<FieldsOfType<F, 'date' | 'daterange'>, 'This brick has no date field'>
type DayKey<F> = Need<FieldsOfType<F, 'date'>, 'This brick has no date field'>

export type StandardTask = 'add' | 'edit' | 'remove'

/** Prefill values by field name, written like that field's value; `'@today'` on a date field is today. */
type Prefill<F extends Fields> = Fields extends F ? { readonly [name: string]: unknown } : { readonly [P in keyof F]?: ValueInput<F[P]> }

interface TaskOptions<F extends Fields> {
  /** `'edit'` (default), `'create'` or `'remove'`. The standard ids `add` and `remove` have their own kind. */
  kind?: 'edit' | 'create' | 'remove'
  /** The fields of the form. Default: all fields of the brick but the address (`f.slug`). */
  fields?: readonly (keyof F & string)[]
  prefill?: Prefill<F>
  /** A staff change waits for an owner's yes. */
  needsApproval?: boolean
}

/** A task: a standard one by its short name, a changed standard one by its id, or an own one with a label. */
export type TaskInput<F extends Fields = Fields> =
  | StandardTask
  | ({ id: StandardTask; label?: Label } & TaskOptions<F>)
  | ({ id: string; label: Label } & TaskOptions<F>)

type Planned<F> = { field: keyof F & string; next: keyof F & string; from: keyof F & string }

/** Content that is due again. T2 writes the weekly work-week form as the v1 prefill `'@workWeek'`; the rest is POC T5. */
type Repeats<F> = { every: 'week' | 'month' | 'year'; start: DayKey<F>; workWeek?: boolean }

export type ShowUntil<K extends string = string> = K | { field: K; plusDays?: number; thenDelete?: boolean }

export type CollectionStatusInput<D extends string = string, K extends string = string> =
  | { show: 'next'; field: D }
  | { show: 'ending' }
  | { show: 'missing'; field: K }
  | { show: 'newest'; field: D }
export type SingleStatusInput = { show: 'opening-hours'; plans?: string }

interface Common<F extends Fields> {
  label: Label
  describe?: Label
  fields: F
  layout?: 'sections' | 'tabs'
  tasks?: readonly TaskInput<F>[]
  planned?: Planned<F>
  repeats?: Repeats<F>
}

export interface SingleInput<F extends Fields> extends Common<F> { status?: SingleStatusInput }

export interface CollectionInput<F extends Fields> extends Common<F> {
  /** The word for one entry ("Service"). The standard tasks are named with it. */
  item?: Label
  /** The field that names an entry in lists and search. Default: the first text field. */
  title?: FieldsOfType<F, 'text'>
  /** Most entries. Default 500. */
  max?: number
  /** Default `'manual'`. */
  order?: 'manual' | { field: keyof F & string; dir?: 'asc' | 'desc' }
  /** The entry is shown until this date has passed. */
  showUntil?: ShowUntil<DateKey<F>>
  untranslated?: 'fallback' | 'hide'
  plans?: { brick: string; field: DayKey<F> }
  status?: CollectionStatusInput<DateKey<F>, keyof F & string>
}

/** A brick as written in v2. The stored tasks and names are untyped here, as in v1: `F` types them where they are written. */
interface Stored<F extends Fields> { [V2]: true; label: Label; describe?: Label; fields: F; layout?: 'sections' | 'tabs'; tasks?: readonly TaskInput[]; planned?: Planned<Fields>; repeats?: Repeats<Fields> }
export interface SingleV2<F extends Fields = Fields> extends Stored<F> { kind: 'single'; status?: SingleStatusInput }
export interface CollectionV2<F extends Fields = Fields> extends Stored<F> {
  kind: 'collection'
  item?: Label
  title?: string
  max?: number
  order?: 'manual' | { field: string; dir?: 'asc' | 'desc' }
  showUntil?: ShowUntil
  untranslated?: 'fallback' | 'hide'
  plans?: { brick: string; field: string }
  status?: CollectionStatusInput
}
export type BrickV2 = SingleV2 | CollectionV2

export function single<const F extends Fields>(input: SingleInput<F>): SingleV2<F> {
  // As in v1: the names in tasks, `planned` and `repeats` are typed by `F` in the input and stored as plain names.
  return { [V2]: true, kind: 'single', ...input } as SingleV2<F>
}

export function collection<const F extends Fields>(input: CollectionInput<F>): CollectionV2<F> {
  return { [V2]: true, kind: 'collection', ...input } as CollectionV2<F>
}
