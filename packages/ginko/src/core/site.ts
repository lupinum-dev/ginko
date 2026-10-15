import type { ComponentRegistry } from './components.ts'
import type { LinkConfig } from './links.ts'
import type { Redirect } from './redirects.ts'
import type {
  Brick, BrickSource, CollectionBrick, Currency, Fields, Json, Label, Locale, RetiredRule, SingleBrick, Task, Visibility,
} from './types.ts'

export interface MigrationContext {
  locales: Locale[]
  mainLocale: Locale
  /** Set when the target field is translatable; `entry` is then resolved for this locale. */
  locale?: Locale
}

export interface Migration {
  brick: string
  fills: string
  /** Pure: no network, no clock, no randomness. Runs locally or in CI, never on the platform. */
  compute: (entry: Record<string, Json>, ctx: MigrationContext) => Json | undefined
}

export interface SiteInput {
  site: string
  name: string
  /**
   * The address of the live site, absolute `http(s)://`, without user, query or `#fragment` (page paths are appended
   * to it). Canonical URLs, the sitemap and share images start with it.
   */
  url: string
  timeZone: string
  /** The site's locales. The first entry is the main locale: the default for content, routes and plain-path pages. */
  locales: readonly [Locale, ...Locale[]]
  /** The BCP 47 language per locale for `lang`, hreflang and dates, e.g. `{ de: 'de-AT' }`. Default: the locale itself. Keys are entries of `locales`. */
  languages?: Partial<Record<Locale, string>>
  /**
   * The first day of the week, 1 (Monday) to 7 (Sunday). Default: the first day of the main locale's language
   * (`languages`), e.g. Monday for `de-AT`, Sunday for `en-US`. Weekly bricks (`@workWeek`) start on this day.
   */
  firstDayOfWeek?: 1 | 2 | 3 | 4 | 5 | 6 | 7
  currency: Currency
  /**
   * Static pages by key: `{ menu: { de: '/speisekarte', en: '/en/menu' } }`. A plain path is the page in
   * the main locale only. The home page is the page whose main-locale path is `/`. The sitemap pairs a page's locales by key.
   */
  pages: Record<string, string | Partial<Record<Locale, string>>>
  bricks: Record<string, Brick>
  /** How the link check (`checkLinks`) rates findings; default: broken `error`, anchors and redirected `warn`; external links are checked only when `external` is set. */
  linkCheck?: LinkConfig
  /** Old URLs that answer with a redirect (patterns: `:name`, trailing `*`). Not part of the schema contract; entries add theirs with `redirectFrom`. */
  redirects?: Redirect[]
  /** Site-wide SEO defaults for `useGinkoSeo`. Not part of the schema contract. */
  seo?: {
    /** `%s` is the page title; default `%s · <name>`. */
    titleTemplate?: string
    description?: string
    /** Fallback Open Graph image: a public path (`/og.png`) or an absolute URL. Generated share cards replace it. */
    image?: string
    /** The brand colour, `#rrggbb` or `#rgb`: the background of generated share cards (nuxt-og-image). */
    color?: string
    organization?: { logo?: string; sameAs?: string[] }
  }
  /** Text for AI agents (`/llms.txt`, `<page>.md`) and the agent door's default. Only `review` is part of the schema contract. */
  agents?: {
    /** Default for the agent door (SPEC 17): `true` makes every agent write a proposal that needs a yes. Default `false`. */
    review?: boolean
    /** The line below the site name in `/llms.txt`; default: `seo.description`. */
    description?: string
    /** `false` turns all of it off. Default `true`. */
    enabled?: boolean
  }
  /** Markdown components for `page` texts, defined once with `defineComponents`. Part of the schema contract. */
  components?: ComponentRegistry
  migrations?: Record<string, Migration>
  retired?: Record<string, RetiredRule>
}

/** The field keys `retired` takes: `menu.headline` for the field `headline` of the brick `menu`. */
type RetiredFieldPath<B> = { [K in keyof B & string]: `${K}.${B[K] extends { fields: infer F } ? keyof F & string : never}` }[keyof B & string]

/** `retired` names bricks of the config (they take `{ drop: true }`) and their fields (any rule); anything else fails. */
type RetiredInput<S extends SiteInput> = { [P in keyof S['retired']]: P extends keyof S['bricks'] ? { drop: true } : P extends RetiredFieldPath<S['bricks']> ? RetiredRule : never }

export function defineSite<const S extends SiteInput>(site: S & { retired?: RetiredInput<S> }): S {
  return site
}

/** The names of the fields in `F` whose type is one of `T`. */
type FieldsOfType<F, T extends string> = { [K in keyof F]: F[K] extends { type: T } ? K : never }[keyof F] & string

/**
 * A planned change of one field (`planned`): from the date in the date field `from` on, `next` replaces `field`. `next`
 * and `from` are optional and set together; every edit task that changes `field` lists them too. Field names only:
 * a factory with generic fields could not name its date field otherwise, so `ginko check` reports the other rules.
 */
type Planned<F> = { field: keyof F & string; next: keyof F & string; from: keyof F & string }

/** A collection's detail page per locale: a path with `[slug]` where the entry's slug goes, e.g. `/blog/[slug]`. */
export type RouteTemplate = `/${string}[slug]${string}`

export function single<const F extends Fields>(input: { label: Label; describe?: Label; source?: BrickSource; fields: F; layout?: 'sections' | 'tabs'; tasks?: readonly Task<F>[]; planned?: Planned<F> }): SingleBrick<F> {
  // A task's prefill is typed by the brick's fields here and stored as JSON; TypeScript cannot relate the two for a generic `F`.
  return { kind: 'single', ...input, tasks: input.tasks as readonly Task[] | undefined }
}

export function collection<const F extends Fields, const R extends Record<Locale, RouteTemplate> | undefined = undefined>(input: {
  label: Label
  describe?: Label
  source?: BrickSource
  fields: F
  layout?: 'sections' | 'tabs'
  tasks?: readonly Task<F>[]
  /** A planned change of one field: from the date in `from` on, `next` replaces `field`. */
  planned?: Planned<F>
  max: number
  order: 'manual' | { field: keyof F & string; dir?: 'asc' | 'desc' }
  route?: R
  visible?: Visibility<FieldsOfType<F, 'date' | 'daterange'>>
  /**
   * A required translatable field is missing in a language: `'hide'` (default with a `route`) leaves the entry out
   * there; `'fallback'` (default without) shows the main language and links to the main-language page.
   */
  untranslated?: 'fallback' | 'hide'
  /** Entries plan weeks of the single brick `brick`; `field` (a date field of this collection) holds the first day of the week (`firstDayOfWeek`). */
  plans?: { brick: string; field: FieldsOfType<F, 'date'> }
  drafts?: boolean
}): CollectionBrick<F, R> {
  // See single(): the prefill types of the tasks.
  return { kind: 'collection', ...input, tasks: input.tasks as readonly Task[] | undefined }
}
