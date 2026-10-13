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
  url: string
  timezone: string
  locales: readonly [Locale, ...Locale[]]
  /** The BCP 47 language per locale for `lang`, hreflang and dates, e.g. `{ de: 'de-AT' }`. Default: the locale itself. */
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
  /** How the link check (`checkLinks`) rates findings; default `error` for broken links, `warn` for missing anchors. */
  linkCheck?: LinkConfig
  /** Old URLs that answer with a redirect (patterns: `:name`, trailing `*`). Not part of the schema contract; entries add theirs with `redirectFrom`. */
  redirects?: Redirect[]
  /** Site-wide SEO defaults for `useGinkoSeo`. Not part of the schema contract. */
  seo?: {
    /** `%s` is the page title; default `%s · <name>`. */
    titleTemplate?: string
    description?: string
    /** Fallback Open Graph image: a public path (`/og.png`) or an absolute URL. */
    image?: string
    organization?: { logo?: string; sameAs?: string[] }
  }
  /** Text for AI agents (`/llms.txt`, `<page>.md`, `Accept: text/markdown`) and the agent door's default. Only `review` is part of the schema contract. */
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

/** The keys `retired` takes: a brick (`gallery`) or a field of a brick (`menu.headline`). */
type RetiredPath<B> = { [K in keyof B & string]: K | `${K}.${B[K] extends { fields: infer F } ? keyof F & string : never}` }[keyof B & string]

export function defineSite<const S extends SiteInput>(site: S & { retired?: { [P in keyof S['retired']]: P extends RetiredPath<S['bricks']> ? RetiredRule : never } }): S {
  return site
}

/** A collection's detail page per locale: a path with `[slug]` where the entry's slug goes, e.g. `/blog/[slug]`. */
export type RouteTemplate = `/${string}[slug]${string}`

export function single<const F extends Fields>(input: { label: Label; describe?: Label; source?: BrickSource; fields: F; layout?: 'sections' | 'tabs'; tasks?: readonly Task<keyof F & string>[] }): SingleBrick<F> {
  return { kind: 'single', ...input }
}

export function collection<const F extends Fields, const R extends Record<Locale, RouteTemplate> | undefined = undefined>(input: {
  label: Label
  describe?: Label
  source?: BrickSource
  fields: F
  layout?: 'sections' | 'tabs'
  tasks?: readonly Task<keyof F & string>[]
  max: number
  order: 'manual' | { field: keyof F & string; dir?: 'asc' | 'desc' }
  route?: R
  visible?: Visibility<keyof F & string>
  untranslated?: 'fallback' | 'hide'
  /** Entries plan weeks of the single brick `brick`; `field` (a date field of this collection) holds the first day of the week (`firstDayOfWeek`). */
  plans?: { brick: string; field: keyof F & string }
  drafts?: boolean
}): CollectionBrick<F, R> {
  return { kind: 'collection', ...input }
}
