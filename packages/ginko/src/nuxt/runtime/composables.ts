/// <reference path="./schema.d.ts" />
// What a site page uses (SPEC 8 "Composables"). Everything reads one state, `ginko:bundle`,
// which the plugin fills per locale (or the preview fills by message), so nothing here fetches.
import { computed, createError, toValue, useI18n, useHead, useRoute, useRuntimeConfig, useState, type ComputedRef, type MaybeRefOrGetter, type Ref } from '#imports'
import schema from '#ginko/schema'
import { defineOgImage, ogTemplate } from '#ginko/og'
import {
  applyDefaults, breadcrumbs, isVisible as visible, navTree, neighbors, organizationLd, query, seoHead, todayIn, websiteLd, weekOfSchema,
  type Brick, type BrickValue, type Bundle, type BundleItem, type Locale, type NavNode, type Query, type QueryResult, type SeoImage, type SiteInput, type WeekInfo,
} from '../../internal.ts'
import { withUrl, type GinkoPublicConfig } from './shared.ts'

/** Filled by the generated types/ginko.d.ts with the site's own config. */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface GinkoRegister {}
type Site = GinkoRegister extends { site: infer S extends SiteInput } ? S : SiteInput
type Bricks = Site['bricks']
type BrickKey = keyof Bricks & string
type CollectionKey = { [K in BrickKey]: Bricks[K] extends { kind: 'collection' } ? K : never }[BrickKey]

/** One entry of a collection, for component props: `defineProps<{ dish: GinkoItem<'menu'> }>()`. Auto-imported. */
export type GinkoItem<K extends CollectionKey> = BrickValue<Bricks[K]> extends { items: (infer I)[] } ? I : never

export const BUNDLE_STATE = 'ginko:bundle'
/** Set by the preview page on mount: the session and locale it accepts bundles for (SPEC 8 "Vorschau"). */
export const PREVIEW_STATE = 'ginko:preview'

/** The keys of the site's `pages` in ginko.config.ts. Auto-imported. */
export type GinkoPageKey = keyof Site['pages'] & string
/** The site's `locales` (a subset of the core `Locale`). Auto-imported. */
export type GinkoLocale = Site['locales'][number]

/** The public facts of the site from ginko.config.ts. The rest of `runtimeConfig.public.ginko` is internal. */
export interface GinkoSite {
  name: string
  /** The production address, for absolute links. */
  url: string
  locales: readonly GinkoLocale[]
  /** The first of `locales`. */
  mainLocale: GinkoLocale
  /** IANA time zone, e.g. `Europe/Vienna`. */
  timezone: string
}

/** `const { url, mainLocale } = useGinkoSite()`: name, address, locales and time zone of the site. Auto-imported. */
export function useGinkoSite(): GinkoSite {
  const { name, url, locales, mainLocale, timezone } = useRuntimeConfig().public.ginko as GinkoPublicConfig
  // The runtime config is this site's own config, so its locales are the site's.
  return { name, url, locales: locales as GinkoLocale[], mainLocale: mainLocale as GinkoLocale, timezone }
}

/** The current locale. ginko-i18n owns it (URL, strategy, excluded paths); it only ever takes a locale of the site. */
export function useGinkoLocale(): ComputedRef<GinkoLocale> {
  const { locale } = useI18n()
  return locale as ComputedRef<GinkoLocale>
}

/**
 * The path of a page of the site config (`pages`) in a locale, default the current one:
 * `const path = useGinkoPath(); path('menu')`, `path('menu', 'en')`. A page without a path in that
 * locale gives its main-locale path, as ginko-i18n's alternates do.
 */
export function useGinkoPath(): (key: GinkoPageKey, locale?: GinkoLocale) => string {
  const current = useGinkoLocale()
  const { mainLocale } = useRuntimeConfig().public.ginko as GinkoPublicConfig
  return (key, locale = current.value) => {
    const paths = schema.pages[key]
    const path = paths?.[locale] ?? paths?.[mainLocale]
    if (path === undefined) throw new Error(`[ginko] Page “${key}” is missing from pages in ginko.config.ts.`)
    return path
  }
}

function useGinkoBundle(): ComputedRef<Bundle> {
  const bundles = useState<Partial<Record<Locale, Bundle>>>(BUNDLE_STATE, () => ({}))
  const locale = useGinkoLocale()
  return computed(() => {
    const bundle = bundles.value[locale.value]
    // The plugin loads the bundle before any page renders; a missing one is a platform failure.
    if (!bundle) throw createError({ statusCode: 503, statusMessage: 'Content unavailable', fatal: true })
    return applyDefaults(bundle, schema)
  })
}

/** Set on the server; the client plugin (today.client.ts) moves it on when midnight passes in the site's zone. */
export const TODAY_STATE = 'ginko:today'

/**
 * Today's date (YYYY-MM-DD) in the site's time zone. The server's value is the first one, so server and
 * client render the same day; a tab left open, or a cached page opened, after midnight then moves on.
 */
export function useGinkoToday(): Ref<string> {
  return useState<string>(TODAY_STATE, () => todayIn((useRuntimeConfig().public.ginko as GinkoPublicConfig).timezone))
}

/** First day of the week and weekend days of the site (`schema.week`, from the main language or `weekStart`), the same the server and the Studio use. */
export function useGinkoWeek(): WeekInfo {
  return weekOfSchema(schema)
}

/**
 * The content of one brick: `{ data, fallback }` for a single, `{ items }` for a collection.
 * Collections contain only entries that are visible today (SPEC 2.1 `visible`), in order.
 */
export function useGinko<K extends BrickKey>(brick: K): ComputedRef<BrickValue<Bricks[K]>> {
  const bundle = useVisibleBundle([brick])
  const locale = useGinkoLocale()
  return computed(() => {
    const value = bundle.value.bricks[brick]
    const def = schema.bricks[brick] as Brick | undefined
    if (value?.kind === 'collection' && def) {
      return { items: def.kind === 'collection' && def.route ? withUrl(value.items, locale.value) : value.items } as BrickValue<Bricks[K]>
    }
    // The bundle is checked against this schema on load (bundleFits), so its brick has this shape.
    return value as unknown as BrickValue<Bricks[K]>
  })
}

/** The bundle with only the entries visible today (SPEC 2.1 `visible`) in the given collections. The one place that rule is applied. */
function useVisibleBundle(bricks: MaybeRefOrGetter<readonly BrickKey[]>): ComputedRef<Bundle> {
  const bundle = useGinkoBundle()
  const today = useGinkoToday()
  return computed(() => {
    const now = today.value
    const out = { ...bundle.value.bricks }
    for (const key of toValue(bricks)) {
      const value = out[key]
      const def = schema.bricks[key] as Brick | undefined
      if (value?.kind === 'collection' && def) out[key] = { ...value, items: value.items.filter((item) => visible(def, item.data, now)) }
    }
    return { ...bundle.value, bricks: out }
  })
}

/** Items of a core result get the `url` of the current locale when the brick has a route. */
function withRouteUrl(brick: string, items: BundleItem[], locale: Locale): BundleItem[] {
  const def = schema.bricks[brick] as Brick | undefined
  return def?.kind === 'collection' && def.route ? withUrl(items, locale) : items
}

/**
 * Query a collection (SPEC 2.1 / core `query`): where, order, limit, page, facets. It runs over the visible
 * entries in the client state, so a hidden entry is neither in `items` nor in `total`. `q` may be a ref or
 * getter (a page number from the route), and the result follows it.
 */
export function useGinkoQuery<K extends CollectionKey>(brick: K, q: MaybeRefOrGetter<Query> = {}): ComputedRef<Omit<QueryResult, 'items'> & { items: GinkoItem<K>[] }> {
  const bundle = useVisibleBundle([brick])
  const locale = useGinkoLocale()
  return computed(() => {
    const result = query(bundle.value, brick, toValue(q), schema)
    // The core returns bundle items; their typed shape is the brick's GinkoItem (same cast as useGinko).
    return { ...result, items: withRouteUrl(brick, result.items, locale.value) } as never
  })
}

/** The entries before and after `id` among the visible ones, in `options.order` (the `Query` order) or bundle order. */
export function useGinkoNeighbors<K extends CollectionKey>(brick: K, id: MaybeRefOrGetter<string>, options: Pick<Query, 'order'> = {}): ComputedRef<{ prev?: GinkoItem<K>; next?: GinkoItem<K> }> {
  const bundle = useVisibleBundle([brick])
  const locale = useGinkoLocale()
  return computed(() => {
    const { prev, next } = neighbors(bundle.value, brick, toValue(id), options.order)
    const one = (item?: BundleItem) => item && withRouteUrl(brick, [item], locale.value)[0]
    return { prev: one(prev), next: one(next) } as never
  })
}

/** Navigation tree of the visible entries of these collections in the current locale (core `navTree`). */
export function useGinkoNav(bricks: MaybeRefOrGetter<CollectionKey[]>): ComputedRef<NavNode[]> {
  const bundle = useVisibleBundle(bricks)
  const locale = useGinkoLocale()
  return computed(() => navTree(bundle.value, toValue(bricks), locale.value))
}

/** The nodes from the root down to the current route's path; empty when the path is not in the tree. */
export function useGinkoBreadcrumbs(bricks: MaybeRefOrGetter<CollectionKey[]>): ComputedRef<NavNode[]> {
  const tree = useGinkoNav(bricks)
  const route = useRoute()
  return computed(() => breadcrumbs(tree.value, route.path))
}

/**
 * `lang` for a field the bundle filled from the main language (SPEC 6 `fallback`), else undefined:
 * `const langOf = useGinkoLang()`, then `:lang="langOf(item, 'note')"`. `path` is the field name, or
 * `list.<_id>.field` inside a list. The value is the language tag of the main locale from `languages` in
 * ginko.config (`de-AT`), the form `lang` attributes need; the bare code (`de`) when the site sets no tag for it.
 */
export function useGinkoLang(): (item: { fallback?: readonly string[] }, path: string) => string | undefined {
  const { mainLocale } = useRuntimeConfig().public.ginko as GinkoPublicConfig
  const tag = useI18n().locales.find((l) => l.code === mainLocale)?.language ?? mainLocale
  return (item, path) => (item.fallback?.includes(path) ? tag : undefined)
}

/**
 * The visible entry whose slug in the current locale is `slug`; otherwise a real 404 (SPEC 8). `slug` may be a
 * getter such as `() => route.params.slug`, so a reused page follows client navigation; an array (catch-all
 * route) is joined with `/`. The 404 is thrown when the value is read, not at the call.
 */
export function useGinkoEntry<K extends CollectionKey>(brick: K, slug: MaybeRefOrGetter<string | string[] | undefined>): ComputedRef<GinkoItem<K>> {
  const items = useGinko(brick)
  const locale = useGinkoLocale()
  return computed(() => {
    const def = schema.bricks[brick]!
    const route = def.kind === 'collection' ? def.route?.[locale.value] : undefined
    const value = toValue(slug)
    const path = value === undefined ? undefined : route?.replace('[slug]', Array.isArray(value) ? value.join('/') : value)
    const item = (items.value as { items: (BundleItem & { url?: string })[] }).items.find((i) => path && i.url === path)
    if (!item) throw createError({ statusCode: 404, statusMessage: 'Not found' })
    return item as never
  })
}

export interface GinkoSeoInput {
  title?: string
  description?: string
  /**
   * A public path (`/og.png`), an absolute URL, or a `SeoImage` with size and alt text; a path becomes absolute with
   * the site `url`. Default: `seo.image` of the site config. Read once at setup to choose the generated card (below).
   */
  image?: SeoImage | string
  type?: 'website' | 'article'
  /** The small label above the title on the generated share card (a docs page shows its section). No card, no effect. */
  section?: string
  noindex?: boolean
  /** Extra JSON-LD objects, for example an `Event` or a `FAQPage`. */
  jsonLd?: Record<string, unknown>[]
}

/**
 * Title, description, Open Graph, Twitter card, robots and JSON-LD of a page in one call (SPEC 8 "SEO").
 * Defaults come from `seo` in ginko.config.ts. The home page of the locale also gets WebSite (and,
 * with `seo.organization`, Organization) JSON-LD. Canonical, hreflang and og:locale are ginko-i18n's.
 */
export function useGinkoSeo(input: MaybeRefOrGetter<GinkoSeoInput>): void {
  const config = useRuntimeConfig().public.ginko as GinkoPublicConfig
  const locale = useGinkoLocale()
  const path = useGinkoPath()
  const route = useRoute()
  const i18n = useI18n()
  const absolute = (src: string) => (/^https?:\/\//.test(src) ? src : new URL(src, config.url).href)
  // With nuxt-og-image installed, a page without its own image gets a generated card (the site's
  // default `seo.image` gives way to it). Decided once per page, like the other setup-time calls.
  const generated = defineOgImage !== undefined && ogTemplate !== undefined && toValue(input).image === undefined
  if (generated && defineOgImage && ogTemplate) {
    defineOgImage(ogTemplate, {
      title: () => toValue(input).title ?? config.name,
      description: () => toValue(input).description ?? config.seo.description ?? '',
      siteName: config.name,
      section: () => toValue(input).section ?? '',
    })
  }
  const trim = (p: string) => (p.length > 1 ? p.replace(/\/$/, '') : p)
  useHead(() => {
    const page = toValue(input)
    const { seo } = config
    const raw = generated ? undefined : (page.image ?? seo.image)
    const image = raw === undefined ? undefined : typeof raw === 'string' ? { url: absolute(raw) } : { ...raw, url: absolute(raw.url) }
    const head = seoHead({ siteName: config.name, titleTemplate: seo.titleTemplate, title: page.title, description: page.description ?? seo.description, image, type: page.type, noindex: page.noindex })
    const ld = [...(page.jsonLd ?? [])]
    // The home page is the page whose main-language path is `/`.
    const home = Object.keys(schema.pages).find((key) => schema.pages[key]?.[config.mainLocale] === '/')
    if (home !== undefined && trim(route.path) === trim(path(home as GinkoPageKey, locale.value))) {
      const lang = i18n.locales.find((l) => l.code === locale.value)?.language ?? locale.value
      ld.unshift(websiteLd({ name: config.name, url: config.url, lang }))
      if (seo.organization) ld.splice(1, 0, organizationLd({ name: config.name, url: config.url, ...seo.organization, logo: seo.organization.logo && absolute(seo.organization.logo) }))
    }
    return {
      title: head.title,
      meta: head.meta,
      // `<` is escaped so a value such as "</script>" cannot end the script element.
      script: ld.map((entry, i) => ({ key: `ginko-ld-${i}`, type: 'application/ld+json', innerHTML: JSON.stringify(entry).replace(/</g, '\\u003c') })),
    }
  })
}
