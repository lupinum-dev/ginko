// Bundle-side types inferred from a site config, for useGinko() (SPEC 2.2 "Bundle" column).
import type { MarkdownValue } from './markdown.ts'
import type {
  BooleanField, ChoiceField, ChoicesField, CollectionBrick, Currency, DateField, DateRangeField, Field, Fields,
  FileField, ImageField, ListField, LongTextField, MarkdownField, MoneyField, NumberField, RefField, SingleBrick, SlugField,
  TextField, TimeField,
} from './types.ts'

declare const unknownChoice: unique symbol
/** A choice value this code does not know yet (added by a later schema release). Handle it with a fallback. */
export type UnknownChoice = string & { readonly [unknownChoice]: true }

export interface Money { amount: number; currency: Currency }
export interface ImageValue {
  url: string
  alt: string
  width: number
  height: number
  /** Where the owner wants a cropped image centred (0..1 from the top left); absent when not set. */
  focus?: { x: number; y: number }
  /** Smaller WebP copies of the image, ascending width; each narrower than `width`. Absent when the file has none. */
  variants?: { width: number; url: string }[]
}
export interface FileValue { url: string; name: string; size: number }

export type ValueOf<F extends Field> =
  F extends RefField ? (F['multiple'] extends true ? string[] : string)
  : F extends ChoiceField<infer V> ? V | UnknownChoice
  : F extends ChoicesField<infer V> ? (V | UnknownChoice)[]
  : F extends ListField<infer Of> ? (DataOf<Of> & { _id: string })[]
  : F extends MarkdownField ? MarkdownValue
  : F extends MoneyField ? Money
  : F extends ImageField ? ImageValue
  : F extends FileField ? FileValue
  : F extends DateRangeField ? { from: string; to: string }
  : F extends NumberField ? number
  : F extends BooleanField ? boolean
  : F extends TextField | LongTextField | SlugField | DateField | TimeField ? string
  : unknown

type OptionalKeys<F extends Fields> = { [K in keyof F]: F[K]['optional'] extends true ? K : never }[keyof F]
type RetiredKeys<F extends Fields> = { [K in keyof F]: F[K]['retired'] extends true ? K : never }[keyof F]

export type DataOf<F extends Fields> = {
  [K in Exclude<keyof F, OptionalKeys<F> | RetiredKeys<F>>]: ValueOf<F[K]>
} & {
  [K in OptionalKeys<F>]?: ValueOf<F[K]>
}

export type ItemOf<F extends Fields, Routed extends boolean = boolean> = {
  id: string
  data: DataOf<F>
  fallback: string[]
  /** The address in every language the entry exists in (language switcher, hreflang). Routed bricks only. */
  urls?: Partial<Record<string, string>>
  /** When the entry last changed (ISO 8601, UTC). Absent when unknown (bundle format 2). */
  updatedAt?: string
  /** Repo-relative path of the entry's main-language file. File entries only (for an "edit this page" link). */
  source?: string
} & (Routed extends true ? {
  /** The address in the current language: a visible routed entry always has one. */
  url: string
} : unknown)

export type BrickValue<B> =
  B extends SingleBrick<infer F> ? { data: DataOf<F>; fallback: string[] }
  : B extends CollectionBrick<infer F, infer R> ? { items: ItemOf<F, undefined extends R ? false : true>[] }
  : never
