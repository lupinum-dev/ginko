import type {
  BooleanField, ChoiceField, ChoicesField, DateField, DateRangeField, Fields, FileField, ImageField,
  ListField, LongTextField, MarkdownField, MoneyField, NumberField, RefField, RowDef, RowSet, RowsField, SlugField, TextField,
  TimeField, Brick, Field, Json, Label, Localized,
} from './types.ts'
import { daysOf, type DayKey, type SiteWeek } from './time.ts'
import type { Money } from './infer.ts'
import { stableJson } from './sha256.ts'
import type { MarkdownProfile } from './markdown.ts'

/** A translatable text as a builder takes it: a plain text is the main language, or one text per language. */
type TextInput = string | Localized<string>

/**
 * The `default` of a field `C` as you write it (`serializeSchema` stores it in the stored form). A text that is not
 * translated (`format`, `translate: false`) takes a plain text only. `never`: the type has no default.
 */
type DefaultInput<C> =
  C extends { type: 'text' | 'longtext' } ? (C extends { format: string } | { translate: false } ? string : TextInput)
  : C extends { type: 'number' } ? number
  : C extends { type: 'money' } ? Pick<Money, 'amount'>
  : C extends { type: 'boolean' } ? boolean
  : C extends { type: 'date' | 'time' } ? string
  : C extends { type: 'daterange' } ? { from: string; to: string }
  : C extends { type: 'choice'; options: readonly { value: infer V }[] } ? V
  : C extends { type: 'choices'; options: readonly { value: infer V }[] } ? readonly V[]
  : C extends { type: 'ref'; multiple: true } ? readonly string[]
  : C extends { type: 'ref' } ? string
  : C extends { type: 'slug' } ? TextInput
  : C extends { type: 'list'; of: infer G extends Fields } ? readonly ListRow<G>[]
  : C extends { type: 'rows'; rows: infer R; of: infer G extends Fields } ? RowsValue<R, G>
  : never

/**
 * A builder's options for the field type `F`: without what the builder (`type`, `label`) or the platform (`pos`,
 * `retired`) sets, and with `default` typed as `D`. `D = never`: the type has no default.
 */
type Opts<F, D = never> = Omit<F, 'type' | 'label' | 'pos' | 'retired' | 'default'> & ([D] extends [never] ? unknown : { default?: D })

/** `O` with every key that `A` does not have set to `never`: an unknown option fails the type check, not the release. */
type Only<O, A> = O & { [K in Exclude<keyof O, keyof A>]: never }

/** A text's `default` narrowed by its own options: plain text when `format` or `translate: false` is set. */
type TextDefault<T extends string, O> = { default?: DefaultInput<{ type: T } & O> }

type OptionInput<V extends string> = V | { value: V; label: Label }

function options<V extends string>(input: readonly OptionInput<V>[]) {
  return input.map((o) => (typeof o === 'string' ? { value: o, label: o } : o))
}

type TextOpts = Opts<TextField, DefaultInput<TextField>>
type LongTextOpts = Opts<LongTextField, DefaultInput<LongTextField>>
type MarkdownOpts = Opts<MarkdownField>
type NumberOpts = Opts<NumberField, DefaultInput<NumberField>>
type MoneyOpts = Opts<MoneyField, DefaultInput<MoneyField>>
type BooleanOpts = Opts<BooleanField, DefaultInput<BooleanField>>
type DateOpts = Opts<DateField, DefaultInput<DateField>>
type TimeOpts = Opts<TimeField, DefaultInput<TimeField>>
type DateRangeOpts = Opts<DateRangeField, DefaultInput<DateRangeField>>
// `V` comes from `options` only, so a `default` that is no option fails.
type ChoiceOpts<V extends string> = Omit<Opts<ChoiceField, NoInfer<V>>, 'options'> & { options: readonly OptionInput<V>[] }
type ChoicesOpts<V extends string> = Omit<Opts<ChoicesField, readonly NoInfer<V>[]>, 'options'> & { options: readonly OptionInput<V>[] }
/**
 * A value as you write it for the field `C`: its `default`, and the text of a markdown field (list cells and prefills
 * hold markdown, although `f.markdown` has no `default`).
 */
export type ValueInput<C> =
  C extends { type: 'markdown' } ? (C extends { translate: false } ? string : TextInput)
  : DefaultInput<C>
/** List rows as written: a fixed `_id` (10 letters or digits) plus a value per column; only optional columns may be missing. */
type ListRow<F extends Fields> = { _id: string }
  & { [K in keyof F as F[K] extends { optional: true } ? never : K]: ValueInput<F[K]> }
  & { [K in keyof F as F[K] extends { optional: true } ? K : never]?: ValueInput<F[K]> }
type ListOpts<F extends Fields> = Omit<Opts<ListField<F>, DefaultInput<ListField<F>>>, 'of'> & { fields: F }
/** Like `Only` for the rows of a list `default`: a cell of a column the list does not have fails the type check. */
type OnlyColumns<O, F> = O extends { default: readonly (infer R)[] } ? { default: readonly (R extends unknown ? Only<R, F & { _id: string }> : never)[] } : unknown
/** The cells of one row of a rows field as written: a value per column; only optional columns may be missing. */
type RowCells<F extends Fields> =
  & { [K in keyof F as F[K] extends { optional: true } ? never : K]: ValueInput<F[K]> }
  & { [K in keyof F as F[K] extends { optional: true } ? K : never]?: ValueInput<F[K]> }
/**
 * The keys of a row set: every day for `'weekdays'`, some days for `'workdays'` (the site's week decides which), the
 * own keys otherwise.
 */
export type RowKeyOf<R> = R extends 'weekdays' | 'workdays' ? DayKey : R extends readonly { key: infer K extends string }[] ? K : string
/** A rows value as written: a row per key; `'workdays'` may leave days out, since the site's week decides its rows. */
type RowsValue<R, F extends Fields> = R extends 'workdays' ? { [K in DayKey]?: RowCells<F> } : { [K in RowKeyOf<R>]: RowCells<F> }
type RowsOpts<F extends Fields, R extends RowSet> = Pick<RowsField, 'hint' | 'optional' | 'group' | 'showWhen'> & {
  /** `'weekdays'`, `'workdays'` or an own list of rows `[{ key: 'spring', label: 'Frühling' }, …]`. */
  rows: R
  /** The columns of one row. */
  fields: F
  default?: RowsValue<R, F>
}
type ImageOpts = Opts<ImageField>
type FileOpts = Opts<FileField>
type RefOpts = Omit<Opts<RefField, DefaultInput<{ type: 'ref' }>>, 'multiple' | 'max'>
type RefsOpts = Omit<Opts<RefField, DefaultInput<{ type: 'ref'; multiple: true }>>, 'multiple'>
type SlugOpts = Omit<Opts<SlugField, DefaultInput<SlugField>>, 'translate'>

// Builders keep options such as `optional: true` as literal types, so the
// bundle types inferred from a site config know which keys may be missing.
export const f = {
  text: <const O extends TextOpts = {}>(label: Label, o?: Only<O, TextOpts> & TextDefault<'text', O>) => ({ type: 'text', label, ...o }) as TextField & O,
  longtext: <const O extends LongTextOpts = {}>(label: Label, o?: Only<O, LongTextOpts> & TextDefault<'longtext', O>) => ({ type: 'longtext', label, ...o }) as LongTextField & O,
  /** Markdown has no `default`: its start value is the empty text. */
  markdown: <const O extends MarkdownOpts = {}>(label: Label, o?: Only<O, MarkdownOpts>) => ({ type: 'markdown', label, ...o }) as MarkdownField & O,
  number: <const O extends NumberOpts>(label: Label, o: Only<O, NumberOpts>) => ({ type: 'number', label, ...o }) as NumberField & O,
  money: <const O extends MoneyOpts = {}>(label: Label, o?: Only<O, MoneyOpts>) => ({ type: 'money', label, ...o }) as MoneyField & O,
  boolean: <const O extends BooleanOpts = {}>(label: Label, o?: Only<O, BooleanOpts>) => ({ type: 'boolean', label, ...o }) as BooleanField & O,
  date: <const O extends DateOpts = {}>(label: Label, o?: Only<O, DateOpts>) => ({ type: 'date', label, ...o }) as DateField & O,
  time: <const O extends TimeOpts = {}>(label: Label, o?: Only<O, TimeOpts>) => ({ type: 'time', label, ...o }) as TimeField & O,
  daterange: <const O extends DateRangeOpts = {}>(label: Label, o?: Only<O, DateRangeOpts>) => ({ type: 'daterange', label, ...o }) as DateRangeField & O,
  choice: <const V extends string, const O extends ChoiceOpts<V>>(label: Label, o: Only<O, ChoiceOpts<V>> & ChoiceOpts<V>) => {
    const { options: input, ...rest } = o
    return { type: 'choice', label, ...rest, options: options(input) } as unknown as ChoiceField<V> & Omit<O, 'options'>
  },
  choices: <const V extends string, const O extends ChoicesOpts<V>>(label: Label, o: Only<O, ChoicesOpts<V>> & ChoicesOpts<V>) => {
    const { options: input, ...rest } = o
    return { type: 'choices', label, ...rest, options: options(input) } as unknown as ChoicesField<V> & Omit<O, 'options'>
  },
  list: <const F extends Fields, const O extends ListOpts<F>>(label: Label, o: Only<O, ListOpts<F>> & OnlyColumns<O, F> & { fields: F }) => {
    const { fields, itemLabel, ...rest } = o
    return { type: 'list', label, itemLabel, of: fields, ...rest } as unknown as ListField<F> & Omit<O, 'fields'>
  },
  /**
   * A table with a fixed set of rows (`rows`) and the same columns in every row (`fields`): the hours of each weekday,
   * the dish of each workday, the prices of each season. People fill every row; they add, remove and move none.
   */
  rows: <const F extends Fields, const R extends RowSet, const O extends RowsOpts<F, R>>(label: Label, o: Only<O, RowsOpts<F, R>> & { rows: R; fields: F }) => {
    const { fields, rows, ...rest } = o
    return { type: 'rows', label, rows, of: fields, ...rest } as unknown as RowsField<F, R> & Omit<O, 'fields' | 'rows' | 'default'>
  },
  /** Images and files have no `default`: their values are uploads of the site's owner. */
  image: <const O extends ImageOpts = {}>(label: Label, o?: Only<O, ImageOpts>) => ({ type: 'image', label, ...o }) as ImageField & O,
  file: <const O extends FileOpts>(label: Label, o: Only<O, FileOpts>) => ({ type: 'file', label, ...o }) as FileField & O,
  /** One entry of the collection `to`: the value is its ID. */
  ref: <const O extends RefOpts>(label: Label, o: Only<O, RefOpts>) => ({ type: 'ref', label, ...o }) as RefField & { multiple?: false } & O,
  /** Several entries of the collection `to`, at most `max`: the value is a list of IDs. Stored as a ref with `multiple: true`. */
  refs: <const O extends RefsOpts>(label: Label, o: Only<O, RefsOpts>) => ({ type: 'ref', label, ...o, multiple: true }) as RefField & { multiple: true } & O,
  /** The address of an entry, made once from the text field `from`; it has its own value per language. */
  slug: <const O extends SlugOpts>(label: Label, o: Only<O, SlugOpts>) => ({ type: 'slug', label, ...o }) as SlugField & O,
}

/** The largest money amount in minor units (one million in a two-decimal currency). */
export const MAX_CENTS = 100_000_000
const TEXT_DEFAULT_MAX = { text: 200, longtext: 2000, markdown: 50000 } as const

/** The Markdown profile a field allows, default included (SPEC 7). */
export function effectiveProfile(field: MarkdownField): MarkdownProfile {
  return field.profile ?? 'rich'
}

/** Whether the Studio shows `field` next to these sibling values (its `showWhen`; no condition: always). */
export function isShown(field: Field, siblings: Readonly<Record<string, Json | undefined>>): boolean {
  const when = field.showWhen
  if (!when) return true
  const equal = stableJson(siblings[when.field] ?? null) === stableJson('is' in when ? when.is : when.not)
  return 'is' in when ? equal : !equal
}

/** The upper limit validation actually applies, defaults included (SPEC 2.2). Infinity = no limit. */
export function effectiveMax(field: Field): number {
  switch (field.type) {
    case 'text': case 'longtext': case 'markdown': return field.max ?? TEXT_DEFAULT_MAX[field.type]
    case 'money': return Math.min(field.max ?? MAX_CENTS, MAX_CENTS)
    case 'ref': return field.multiple ? field.max ?? Infinity : Infinity
    case 'choices': return Math.min(field.max ?? field.options.length, field.options.length)
    case 'number': case 'list': return field.max
    case 'file': return field.maxBytes
    default: return Infinity
  }
}

/** The lower limit validation actually applies. -Infinity = no limit. */
export function effectiveMin(field: Field): number {
  switch (field.type) {
    case 'number': return field.min
    case 'money': return field.min ?? 0
    case 'list': return field.min ?? 0
    default: return -Infinity
  }
}

/** A field whose value holds rows of the columns `of`: a list (rows by `_id`) or a rows field (rows by key). */
export type TableField = ListField | RowsField
export const isTable = (field: Field): field is TableField => field.type === 'list' || field.type === 'rows'

const isRow = (value: unknown): value is Record<string, Json> => typeof value === 'object' && value !== null && !Array.isArray(value)

/**
 * The row keys of a rows field, in the order the Studio shows them: the seven days or the workdays from the site's
 * `week.firstDay` on, or the own rows. Days need the site's week (`checkSchema` requires it); without one this throws.
 */
export function rowKeysOf(field: RowsField, week: SiteWeek | undefined): string[] {
  if (field.rows === 'weekdays') return daysOf(week)
  if (field.rows === 'workdays') return daysOf(week).slice(0, week!.workdays)
  return field.rows.map((row: RowDef) => row.key)
}

/**
 * The rows of a list or rows value, each with the segment a path uses for it: a list row's `_id` (`#<index>` without
 * one), a rows field's row key. Anything that is not a row is left out.
 */
export function rowsIn(field: TableField, value: unknown): [string, Record<string, Json>][] {
  if (field.type === 'list') return Array.isArray(value) ? value.flatMap((row, i) => (isRow(row) ? [[typeof row._id === 'string' ? row._id : `#${i}`, row] as [string, Record<string, Json>]] : [])) : []
  return isRow(value) ? Object.entries(value).filter((entry): entry is [string, Record<string, Json>] => isRow(entry[1])) : []
}

/** The value with `fn` applied to every row, in its own shape: a list stays a list, a rows map stays a map. */
export function mapRows(field: TableField, value: Json, fn: (row: Record<string, Json>) => Json): Json {
  if (field.type === 'list') return Array.isArray(value) ? value.map((row) => (isRow(row) ? fn(row) : row)) : value
  return isRow(value) ? Object.fromEntries(Object.entries(value).map(([key, row]) => [key, isRow(row) ? fn(row) : row])) : value
}

/** One row of the columns `of` filled with their defaults; undefined when a required live column has none. */
export function rowDefaults(of: Fields): Record<string, Json> | undefined {
  const row: Record<string, Json> = {}
  for (const [name, column] of Object.entries(of)) {
    if (column.retired) continue
    if (column.default !== undefined) row[name] = column.default
    else if (!column.optional) return undefined
  }
  return row
}

/**
 * The value a field starts with: its `default`. A rows field without one starts with every row filled from its
 * columns' defaults, when they fill a row (`rowDefaults`); its rows need the site's week.
 */
export function startValue(field: Field, week: SiteWeek | undefined): Json | undefined {
  if (field.default !== undefined || field.type !== 'rows') return field.default
  const row = rowDefaults(field.of)
  return row && Object.fromEntries(rowKeysOf(field, week).map((key) => [key, row]))
}

/** The address field of a brick: its one live slug field (`checkSchema` allows one per collection), or undefined. */
export function slugKeyOf(brick: Brick): string | undefined {
  return Object.keys(brick.fields).find((key) => brick.fields[key]!.type === 'slug' && !brick.fields[key]!.retired)
}

/** Types whose values are stored as Localized<T> unless `translate: false`. Image stores only its `alt` localized. */
export const TRANSLATABLE_TYPES = new Set(['text', 'longtext', 'markdown', 'slug'])

export function isTranslatable(field: { type: string; translate?: false | 'manual'; format?: string }): boolean {
  if (field.type === 'slug') return true
  if (!TRANSLATABLE_TYPES.has(field.type)) return false
  if (field.type === 'text' && field.format) return false
  return field.translate !== false
}

/** The longest alt text, own or library. */
export const ALT_MAX = 300
/**
 * What an image description must not hold: control characters (as text fields, `controlChars`) and bidi overrides,
 * which turn the words around when a screen reader reads them out.
 */
export const ALT_INVISIBLE = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u202a-\u202e\u2066-\u2069]/

/**
 * The description an image use shows in one language: the field's own trimmed text when it has
 * some, else the Files library text of that language, else ''. Validation, the missing-alt
 * bookkeeping and the bundle all use this one rule.
 */
export function effectiveAlt(own: unknown, library: Record<string, string> | undefined, locale: string): string {
  const text = (map: unknown) => {
    const value = typeof map === 'object' && map !== null ? (map as Record<string, unknown>)[locale] : undefined
    return typeof value === 'string' ? value.trim() : ''
  }
  return text(own) || text(library)
}
