// Bundle-side types inferred from a site config, for useGinko() (SPEC 2.2 "Bundle" column).
import type { MarkdownValue } from './markdown.ts'
import type {
  AspectRatio, BooleanField, ChoiceField, ChoicesField, CollectionBrick, Currency, DateField, DateRangeField, Field, Fields,
  FileField, ImageField, ListField, LongTextField, MarkdownField, MoneyField, NumberField, RefField, RowsField, SingleBrick,
  SlugField, TextField, TimeField,
} from './types.ts'
import type { RowKeyOf } from './fields.ts'
import type { DayKey } from './time.ts'

declare const unknownChoice: unique symbol
/** A choice value this code does not know yet (added by a later schema release). Handle it with a fallback. */
export type UnknownChoice = string & { readonly [unknownChoice]: true }

export interface Money {
  /** In minor units, e.g. cents: 12.50 EUR is 1250. Never negative. */
  amount: number
  currency: Currency
}
export interface ImageValue {
  url: string
  alt: string
  width: number
  height: number
  /** Where the owner wants a cropped image centred (0..1 from the top left); absent when not set. */
  focus?: { x: number; y: number }
  /** Smaller WebP copies of the image, ascending width; each narrower than `width`. Absent when the file has none. */
  variants?: { width: number; url: string }[]
  /** The field's frame or frames (`f.image(…, { aspect })`), for `<GinkoImage>`; absent when the field has none. */
  aspect?: AspectRatio | Readonly<Record<string, AspectRatio>>
}
export interface FileValue { url: string; name: string; size: number }

export type ValueOf<F extends Field> =
  F extends RefField ? (F['multiple'] extends true ? string[] : string)
  : F extends ChoiceField<infer V> ? V | UnknownChoice
  : F extends ChoicesField<infer V> ? (V | UnknownChoice)[]
  : F extends ListField<infer Of> ? (DataOf<Of> & { _id: string })[]
  // The site's week decides which days are workdays, so each of them may be absent in the type.
  : F extends RowsField<infer Of, infer R> ? (R extends 'workdays' ? { [K in DayKey]?: DataOf<Of> } : { [K in RowKeyOf<R>]: DataOf<Of> })
  : F extends MarkdownField ? MarkdownValue
  : F extends MoneyField ? Money
  : F extends ImageField ? ImageValue
  : F extends FileField ? FileValue
  : F extends DateRangeField ? { from: string; to: string }
  : F extends NumberField ? number
  : F extends BooleanField ? boolean
  : F extends TextField | LongTextField | SlugField | DateField | TimeField ? string
  : unknown

/** Optional fields, and fields with `showWhen`: those are required only while shown, so a value can be absent. */
type OptionalKeys<F extends Fields> = { [K in keyof F]: F[K]['optional'] extends true ? K : F[K] extends { showWhen: object } ? K : never }[keyof F]
type RetiredKeys<F extends Fields> = { [K in keyof F]: F[K]['retired'] extends true ? K : never }[keyof F]

export type DataOf<F extends Fields> = {
  [K in Exclude<keyof F, OptionalKeys<F> | RetiredKeys<F>>]: ValueOf<F[K]>
} & {
  [K in OptionalKeys<F>]?: ValueOf<F[K]>
}

/**
 * A change that starts later (`upcoming`): its day and the values of the brick's `timeline.public` fields it sets. A
 * field it clears is `null`. Typed over every field of the brick: `single` and `collection` keep the names of
 * `timeline.public` as plain strings (`BrickTimeline`), not as literals, so the type cannot narrow to them; at runtime
 * only those fields are in `data`.
 */
export interface UpcomingOf<F extends Fields> {
  from: string
  /** The last day of an exception: its values hold from `from` to `until`, then the normal values come back. */
  until?: string
  /** The owner's name for it ("Sommer"), as written: it is not translated. */
  name?: string
  /** It comes back every year; `from` and `until` are the days of its next time. */
  yearly?: true
  data: { [K in keyof DataOf<F>]?: DataOf<F>[K] | null }
}

/**
 * An exception that holds today (`holding`): its days, its values of the brick's `timeline.public` fields (already in
 * `data`) and the normal values they cover, so a page can write "9,90 € bis 31. Dez. (sonst 12,90 €)". Typed like
 * `UpcomingOf`.
 */
export interface HoldingOf<F extends Fields> {
  /** The days of the time that holds (for a yearly change: this year's). */
  from: string
  until: string
  /** The owner's name for it, as written: it is not translated. */
  name?: string
  /** It comes back every year. */
  yearly?: true
  data: { [K in keyof DataOf<F>]?: DataOf<F>[K] | null }
  normal: { [K in keyof DataOf<F>]?: DataOf<F>[K] | null }
}

export type ItemOf<F extends Fields, Routed extends boolean = boolean> = {
  id: string
  data: DataOf<F>
  fallback: string[]
  /** The waiting changes of the fields in the brick's `timeline.public`, in the order of their days. Absent when none waits. */
  upcoming?: UpcomingOf<F>[]
  /** The exceptions of the fields in the brick's `timeline.public` that hold today. Absent when none holds. */
  holding?: HoldingOf<F>[]
  /** The address in every language the entry exists in (language switcher, hreflang). Routed bricks only. */
  urls?: Partial<Record<string, string>>
  /** When the entry last changed (ISO 8601, UTC). Absent when unknown. */
  updatedAt?: string
} & (Routed extends true ? {
  /** The address in the current language: a visible routed entry always has one. */
  url: string
} : unknown)

export type BrickValue<B> =
  B extends SingleBrick<infer F> ? { data: DataOf<F>; fallback: string[]; upcoming?: UpcomingOf<F>[]; holding?: HoldingOf<F>[] }
  : B extends CollectionBrick<infer F, infer R> ? { items: ItemOf<F, undefined extends R ? false : true>[] }
  : never
