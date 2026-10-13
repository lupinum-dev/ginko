import type {
  BooleanField, ChoiceField, ChoicesField, DateField, DateRangeField, Fields, FileField, ImageField,
  ListField, LongTextField, MarkdownField, MoneyField, NumberField, RefField, SlugField, TextField, TimeField,
  Field, Json, Label, Localized,
} from './types.ts'
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
 * A value as you write it for the field `C`: its `default`, the rows of a list, and the text of a markdown field
 * (list cells and prefills hold markdown, although `f.markdown` has no `default`).
 */
export type ValueInput<C> =
  C extends { type: 'markdown' } ? TextInput
  : C extends { type: 'list'; of: infer G extends Fields } ? readonly ListRow<G>[]
  : DefaultInput<C>
/** List rows as written: a fixed `_id` (10 letters or digits) plus a value per column; only optional columns may be missing. */
type ListRow<F extends Fields> = { _id: string }
  & { [K in keyof F as F[K] extends { optional: true } ? never : K]: ValueInput<F[K]> }
  & { [K in keyof F as F[K] extends { optional: true } ? K : never]?: ValueInput<F[K]> }
type ListOpts<F extends Fields> = Omit<Opts<ListField<F>, readonly ListRow<F>[]>, 'of'> & { fields: F }
/** Like `Only` for the rows of a list `default`: a cell of a column the list does not have fails the type check. */
type OnlyColumns<O, F> = O extends { default: readonly (infer R)[] } ? { default: readonly (R extends unknown ? Only<R, F & { _id: string }> : never)[] } : unknown
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
