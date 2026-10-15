import type { ComponentRegistry } from './components.ts'
import type { MarkdownProfile } from './markdown.ts'
import type { ValueInput } from './fields.ts'
import type { Msg } from './messages.ts'
import type { WeekInfo } from './time.ts'
import type { StoredHolidays } from './holidays.ts'
// The schema as plain data. This is what `ginko.config.ts` describes, what
// `ginko release` sends, and what the platform stores. SPEC.md part 2.

/**
 * A locale code: a canonical BCP-47 tag such as `de`, `es`, `pt-BR` or `zh-Hant`, the key of every translated
 * value and the URL segment (not the `languages` tag used for `lang` and formats). Open; `isLocale` is the runtime check.
 */
export type Locale = string
/** An ISO-4217 code such as `EUR`, `CHF` or `JPY`; `isCurrency` is the runtime check. Money is stored in minor units (cents). */
export type Currency = string
/** A name shown to people: a string is the main language; a record has one text per language and must contain the main language or English (the fallback). */
export type Label = string | Record<Locale, string>
export type Json = null | boolean | number | string | Json[] | { [key: string]: Json }

/** A translatable value: one entry per locale, always, even for one-language sites. */
export type Localized<T> = Partial<Record<Locale, T>>

export interface ChoiceOption {
  value: string
  label: Label
}

interface FieldBase {
  label: Label
  /** @internal Platform-managed: position in the config, set by serializeSchema (stored objects lose key order). Do not set it. */
  pos?: number
  /** A short help text under the field, per language like `label`. */
  hint?: Label
  optional?: boolean
  /** Storage format. Translatable fields use Localized. */
  default?: Json
  /** `false` turns translation off for a translatable type; `'manual'` never gets machine suggestions. */
  translate?: false | 'manual'
  /** @internal Platform-managed: set when a field is listed in `retired`. Do not set it. */
  retired?: true
  /**
   * Show the field in the Studio only while a sibling field (same brick, list row or component) `is` a value,
   * or is `not` that value (a missing value counts as not equal). Display only: stored values and checks stay.
   */
  showWhen?: { field: string; is: Json } | { field: string; not: Json }
  /** Shows the field under this heading in the Studio, with the other fields of the same group. Display only. */
  group?: Label
}

export interface TextField extends FieldBase { type: 'text'; max?: number; format?: 'url' | 'email' | 'tel' }
export interface LongTextField extends FieldBase { type: 'longtext'; max?: number }
/**
 * Markdown text (V1.md rule 1), stored as a string; the bundle carries the parsed tree. `profile`
 * limits the syntax (default `rich`), `max` the characters (default 50000). In a file brick it is the file's body.
 */
export interface MarkdownField extends FieldBase { type: 'markdown'; profile?: MarkdownProfile; max?: number }
export interface NumberField extends FieldBase { type: 'number'; min: number; max: number; step: number; unit?: string }
export interface MoneyField extends FieldBase { type: 'money'; min?: number; max?: number; currency?: Currency }
export interface BooleanField extends FieldBase { type: 'boolean' }
export interface DateField extends FieldBase { type: 'date' }
export interface TimeField extends FieldBase {
  type: 'time'
  /** Another time field of the brick that this one must be later than (an end after its start), checked when both are set. */
  after?: string
}
export interface DateRangeField extends FieldBase { type: 'daterange' }
export interface ChoiceField<V extends string = string> extends FieldBase { type: 'choice'; options: readonly { value: V; label: Label }[] }
export interface ChoicesField<V extends string = string> extends FieldBase { type: 'choices'; options: readonly { value: V; label: Label }[]; max?: number }
export interface ListField<F extends Fields = Fields> extends FieldBase {
  type: 'list'; of: F; itemLabel: Label; max: number
  /** Fewest rows. With `max` equal and a unique required choice this expresses "every option exactly once". */
  min?: number
  /** A required subfield (choice, text, date or time) whose value must differ in every row. */
  unique?: string
}
/** Points to entries of a collection brick `to`; stores the entry ID (a list of IDs with `multiple`). `max` only with `multiple`. */
export interface RefField extends FieldBase { type: 'ref'; to: string; multiple?: boolean; max?: number }
export interface ImageField extends FieldBase { type: 'image' }
export interface FileField extends FieldBase { type: 'file'; accept: readonly 'pdf'[]; maxBytes: number }
export interface SlugField extends FieldBase { type: 'slug'; from: string }

export type Field =
  | TextField | LongTextField | MarkdownField | NumberField | MoneyField | BooleanField
  | DateField | TimeField | DateRangeField | ChoiceField | ChoicesField | ListField
  | ImageField | FileField | SlugField | RefField

export type FieldType = Field['type']
export type Fields = Record<string, Field>

/**
 * Values the platform resolves in the site's time zone when a task opens: `@today`; `@workWeek`, the first day
 * of the work week (at the weekend, after the last workday, the coming week); `@nextWorkWeek`, the week after it.
 */
export const PREFILL_TOKENS = ['@today', '@workWeek', '@nextWorkWeek'] as const
export type PrefillToken = typeof PREFILL_TOKENS[number]
export const isPrefillToken = (value: unknown): value is PrefillToken => PREFILL_TOKENS.includes(value as PrefillToken)

/**
 * A quick task of a brick. `needsApproval: true`: what staff does with this task goes live only after an owner or
 * admin approves it (SPEC 17). `F` is the fields of the brick: in `single()` and `collection()` a task names only
 * fields the brick has, and a prefill is written like that field's value (see `ValueInput`). The release check
 * reports a token on a field that is not a `date`. A `create` task may list `fields`: it then asks for and writes only
 * those (besides its prefill and the fields' defaults), like an `edit` task. Without `fields` it asks for every field
 * but the slug and the plan of a planned change. The release check wants every required field without a default
 * (and not a slug) in `fields` or in the prefill.
 */
export type Task<F extends Fields = Fields> =
  | { id: string; label: Label; kind: 'edit'; fields: readonly (keyof F & string)[]; pick?: boolean; prefill?: Prefill<F>; needsApproval?: boolean }
  | { id: string; label: Label; kind: 'create'; fields?: readonly (keyof F & string)[]; prefill?: Prefill<F>; needsApproval?: boolean }
  | { id: string; label: Label; kind: 'remove'; needsApproval?: boolean }

/** Prefill values by field name. Without known fields (the stored schema) any JSON or token. */
type Prefill<F extends Fields> = Fields extends F
  ? { readonly [name: string]: Json | PrefillToken | undefined }
  : { readonly [P in keyof F]?: ValueInput<F[P]> }

/**
 * Which entries of a collection the website shows. `always`: all of them. `until`: an entry is shown until the
 * date in `field` (a `date`, or the end `to` of a `daterange`) has passed, plus `days` more (a week that starts
 * on that day: `days: 6`). An empty field always shows the entry. `deleteExpired: true` lets the platform delete
 * entries that are no longer shown (see the docs page "Bricks", Visibility).
 */
export type Visibility<K extends string = string> =
  | { mode: 'always' }
  | { mode: 'until'; field: K; days?: number; deleteExpired?: boolean }

/**
 * The one-line status of a collection on the Studio's Today page, computed on the server from the live entries:
 * `next` the first entry whose date (a `date`, or a `daterange` that has not ended) is today or later; `count` how many
 * entries end within 7 days (needs `visible: { mode: 'until' }`); `missing` how many entries leave an optional field
 * without a default empty; `age` the newest entry by a date field and how long ago that is. A status also says when a
 * section is due: entries end within 7 days, entries miss the field, or the next entry is within 7 days and misses a
 * required text. Changing it changes no stored data.
 */
export type CollectionStatus<D extends string = string, K extends string = string> =
  | { next: D }
  | { count: true }
  | { missing: K }
  | { age: D }

/**
 * The status of a single brick on the Studio's Today page: `hours` shows today's opening hours ("Open today
 * 11:30–14:30", "Closed today") from the brick's `week`, `exceptions`, `closedOn` and `holidays` fields.
 * `{ hours: { plans: 'hourPlans' } }` also reads the site's hour plans (a collection of `hourPlans()`, by its key): the
 * line follows the plan that applies today.
 */
export type SingleStatus = { hours: true | { plans: string } }

export type BrickStatus = CollectionStatus | SingleStatus

/** Where a brick's content comes from: the platform (default) or Markdown files in the site's repo (CONTENT.md). */
export type BrickSource = 'files'

export interface SingleBrick<F extends Fields = Fields> {
  kind: 'single'
  source?: BrickSource
  label: Label
  /** @internal Platform-managed position in the config (see FieldBase.pos). Do not set it. */
  pos?: number
  /** What the brick is for, shown in the Studio; a text or a text per language like `label`. Fields have `hint` instead. */
  describe?: Label
  fields: F
  /** How the Studio shows field groups: headings one below the other, or tabs on wide screens (phones always show headings). */
  layout?: 'sections' | 'tabs'
  tasks?: readonly Task[]
  /**
   * A planned change of one field: from the date in `from` on, the value in `next` replaces `field`, e.g. a price that
   * goes up on the 1st. `next` (the type of `field`) and `from` (a date) are optional fields that are set together, and
   * every edit task that changes `field` shows them too. The site applies the plan; the platform checks it and opens a
   * task on the value in effect.
   */
  planned?: { field: string; next: string; from: string }
  /** The status line on the Studio's Today page (see `SingleStatus`). */
  status?: SingleStatus
  /** @internal Platform-managed: set when the brick is listed in `retired`. Do not set it. */
  retired?: true
}

/** `R` is the type of `route`: a brick with a route has detail pages, so its items carry a `url` (see ItemOf). */
export interface CollectionBrick<F extends Fields = Fields, R extends Partial<Record<Locale, string>> | undefined = Partial<Record<Locale, string>> | undefined> {
  kind: 'collection'
  source?: BrickSource
  label: Label
  /** @internal Platform-managed position in the config (see FieldBase.pos). Do not set it. */
  pos?: number
  /** What the brick is for, shown in the Studio; a text or a text per language like `label`. Fields have `hint` instead. */
  describe?: Label
  fields: F
  /** How the Studio shows field groups: headings one below the other, or tabs on wide screens (phones always show headings). */
  layout?: 'sections' | 'tabs'
  tasks?: readonly Task[]
  /**
   * A planned change of one field: from the date in `from` on, the value in `next` replaces `field`, e.g. a price that
   * goes up on the 1st. `next` (the type of `field`) and `from` (a date) are optional fields that are set together, and
   * every edit task that changes `field` shows them too. The site applies the plan; the platform checks it and opens a
   * task on the value in effect.
   */
  planned?: { field: string; next: string; from: string }
  max: number
  /** `manual`: the owner sorts the entries. Else by a field, ascending unless `dir: 'desc'`. */
  order: 'manual' | { field: string; dir?: 'asc' | 'desc' }
  route?: R
  visible?: Visibility
  /**
   * What an entry does in a language where a translatable required field is missing (an outdated translation still
   * counts): `'hide'` leaves it out of that language (no page, not in lists, sitemap or hreflang); `'fallback'` shows
   * the main language there and, with a `route`, links to the main-language page. Default: `'hide'` with a `route`,
   * else `'fallback'` (`untranslatedMode`).
   */
  untranslated?: 'fallback' | 'hide'
  /** Entries of this collection plan weeks of the single brick `brick`; `field` (a date field here) holds the first day of the week (`week.firstDay`). A planned week counts as entered for the weekly upkeep rule. */
  plans?: { brick: string; field: string }
  /** Entries can be saved as drafts and are shown only once published. */
  drafts?: boolean
  /** The status line on the Studio's Today page (see `CollectionStatus`). Without one, a collection with drafts shows its drafts and scheduled entries. */
  status?: CollectionStatus
  /** @internal Platform-managed: set when the brick is listed in `retired`. Do not set it. */
  retired?: true
}

export type Brick = SingleBrick | CollectionBrick

/**
 * What a retired field (SPEC 2.5) answers to old code: `from` mirrors another field of the brick, `value` is a fixed
 * value, `drop: true` gives no value (optional fields only). A retired brick takes `{ drop: true }`.
 */
export type RetiredRule = { from: string } | { value: Json } | { drop: true }

/** A migration as stored and transferred: the function itself never leaves the developer's machine or CI. */
export interface MigrationDescriptor {
  id: string
  brick: string
  fills: string
  fingerprint: string
}

/** The serialized schema (JSON). `serializeSchema()` produces it; the platform stores it. */
export interface Schema {
  site: string
  name: string
  url: string
  timeZone: string
  locales: Locale[]
  currency: Currency
  /** First day of the week and weekend days of the site (computed once from the main language or `firstDayOfWeek`). */
  week: WeekInfo
  /** The public-holiday calendar of the site (`calendar`, else from `country`); absent when the config sets neither. */
  holidays?: StoredHolidays
  /** Static pages by key, each with its path per locale (the home page is the one whose main-locale path is `/`). */
  pages: Record<string, Partial<Record<Locale, string>>>
  bricks: Record<string, Brick>
  migrations: MigrationDescriptor[]
  retired: Record<string, RetiredRule>
  /** Markdown components of `page` texts (components.ts). Absent: any tag except the blocked ones, with the global attributes only (attributeProblem). */
  components?: ComponentRegistry
  /** Default for the agent door (SPEC 17): `review: true` makes every agent write a proposal. */
  agents?: { review?: boolean }
}

export interface Issue {
  /** Dotted path; list rows by `_id`, e.g. `days.k3Fd9aZ0qx.dish`; locales as last segment, e.g. `closedNote.en`. */
  path: string
  code: string
  /** Catalog key (`issues.tooLong`) and its parameters: translate with `coreMessage(locale, key, params)`. */
  key: string
  params?: Msg['params']
  /** The German text, built from the same catalog. */
  message: string
}
