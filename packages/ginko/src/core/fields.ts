import type {
  BooleanField, ChoiceField, ChoicesField, DateField, DateRangeField, Fields, FileField, ImageField,
  ListField, LongTextField, MarkdownField, MoneyField, NumberField, RefField, SlugField, TextField, TimeField,
  Field, Json,
} from './types.ts'
import type { Label } from './types.ts'
import { stableJson } from './sha256.ts'
import type { MarkdownProfile } from './markdown.ts'

type Opts<F> = Omit<F, 'type' | 'label'>
type OptionInput<V extends string> = V | { value: V; label: Label }

function options<V extends string>(input: readonly OptionInput<V>[]) {
  return input.map((o) => (typeof o === 'string' ? { value: o, label: o } : o))
}

// Builders keep options such as `optional: true` as literal types, so the
// bundle types inferred from a site config know which keys may be missing.
export const f = {
  text: <const O extends Opts<TextField> = {}>(label: Label, o?: O) => ({ type: 'text', label, ...o }) as TextField & O,
  longtext: <const O extends Opts<LongTextField> = {}>(label: Label, o?: O) => ({ type: 'longtext', label, ...o }) as LongTextField & O,
  markdown: <const O extends Opts<MarkdownField> = {}>(label: Label, o?: O) => ({ type: 'markdown', label, ...o }) as MarkdownField & O,
  number: <const O extends Opts<NumberField>>(label: Label, o: O) => ({ type: 'number', label, ...o }) as NumberField & O,
  money: <const O extends Opts<MoneyField> = {}>(label: Label, o?: O) => ({ type: 'money', label, ...o }) as MoneyField & O,
  boolean: <const O extends Opts<BooleanField> = {}>(label: Label, o?: O) => ({ type: 'boolean', label, ...o }) as BooleanField & O,
  date: <const O extends Opts<DateField> = {}>(label: Label, o?: O) => ({ type: 'date', label, ...o }) as DateField & O,
  time: <const O extends Opts<TimeField> = {}>(label: Label, o?: O) => ({ type: 'time', label, ...o }) as TimeField & O,
  daterange: <const O extends Opts<DateRangeField> = {}>(label: Label, o?: O) => ({ type: 'daterange', label, ...o }) as DateRangeField & O,
  choice: <const V extends string, const O extends Omit<Opts<ChoiceField>, 'options'> = {}>(label: Label, o: O & { options: readonly OptionInput<V>[] }) => {
    const { options: input, ...rest } = o
    return { type: 'choice', label, ...rest, options: options(input) } as unknown as ChoiceField<V> & Omit<O, 'options'>
  },
  choices: <const V extends string, const O extends Omit<Opts<ChoicesField>, 'options'> = {}>(label: Label, o: O & { options: readonly OptionInput<V>[] }) => {
    const { options: input, ...rest } = o
    return { type: 'choices', label, ...rest, options: options(input) } as unknown as ChoicesField<V> & Omit<O, 'options'>
  },
  list: <const F extends Fields, const O extends Omit<Opts<ListField<F>>, 'of'>>(label: Label, o: O & { fields: F }) => {
    const { fields, itemLabel, ...rest } = o
    return { type: 'list', label, itemLabel, of: fields, ...rest } as unknown as ListField<F> & Omit<O, 'fields'>
  },
  image: <const O extends Opts<ImageField> = {}>(label: Label, o?: O) => ({ type: 'image', label, ...o }) as ImageField & O,
  file: <const O extends Opts<FileField>>(label: Label, o: O) => ({ type: 'file', label, ...o }) as FileField & O,
  ref: <const O extends Omit<Opts<RefField>, 'to'> = {}>(label: Label, o: O & { to: string }) => ({ type: 'ref', label, ...o }) as RefField & O,
  slug: <const O extends Opts<SlugField>>(label: Label, o: O) => ({ type: 'slug', label, ...o }) as SlugField & O,
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
