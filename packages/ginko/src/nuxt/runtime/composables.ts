/// <reference path="./schema.d.ts" />
// What a site page uses (SPEC 8 "Composables"). Everything reads one state, `ginko:bundle`,
// which the plugin fills per locale (or the preview fills by message), so nothing here fetches.
import { computed, createError, toRef, toValue, useI18n, useHead, useRoute, useRuntimeConfig, useState, type ComputedRef, type MaybeRefOrGetter, type Ref } from '#imports'
import schema from '#ginko/schema'
import { defineOgImage, ogTemplate } from '#ginko/og'
import { useSchemaOrg } from '#ginko/schema-org'
import {
  applyDefaults, breadcrumbs, factText, isVisible as visible, navTree, neighbors, organizationLd, ORGANIZATION_TYPES, query, seoHead, todayIn, websiteLd, withCountry, withAbsoluteImages,
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
/** The `data` of one entry of a collection: what `useGinkoQuery` filters and sorts by. */
type GinkoData<K extends CollectionKey> = GinkoItem<K> extends { data: infer D } ? D : never

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
  timeZone: string
}

/** `const { url, mainLocale } = useGinkoSite()`: name, address, locales and time zone of the site. Auto-imported. */
export function useGinkoSite(): GinkoSite {
  const { name, url, locales, mainLocale, timeZone } = useRuntimeConfig().public.ginko as GinkoPublicConfig
  // The runtime config is this site's own config, so its locales are the site's.
  return { name, url, locales: locales as GinkoLocale[], mainLocale: mainLocale as GinkoLocale, timeZone }
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
  return useState<string>(TODAY_STATE, () => todayIn((useRuntimeConfig().public.ginko as GinkoPublicConfig).timeZone))
}

/**
 * The text of a fact (`facts` in ginko.config): `useGinkoFact('practice.price')` → "98 €", the value in effect today
 * (a planned change counts from its date), formatted for the current language. The same text `:fact{name="…"}`
 * shows in a Markdown field, in search and in the page's Markdown twin. Undefined while the field is empty.
 */
export function useGinkoFact(name: MaybeRefOrGetter<string>): ComputedRef<string | undefined> {
  const bundle = useGinkoBundle()
  const today = useGinkoToday()
  const { languages } = useRuntimeConfig().public.ginko as GinkoPublicConfig
  return computed(() => {
    const b = bundle.value
    return factText(toValue(name), { bricks: schema.bricks, data: b.bricks, locale: b.locale, mainLocale: b.mainLocale, language: languages[b.locale] ?? b.locale, today: today.value })
  })
}

/** First day of the week and weekend days of the site (`schema.week`, from the main language or `firstDayOfWeek`), the same the server and the Studio use. */
export function useGinkoWeek(): WeekInfo {
  return schema.week
}

/**
 * The content of one brick: `{ data, fallback }` for a single, `{ items }` for a collection.
 * Collections contain only entries that are visible today (SPEC 2.1 `visible`), in order.
 */
export function useGinko<K extends BrickKey>(brick: K): ComputedRef<BrickValue<Bricks[K]>> {
  const bundle = useVisibleBundle([brick])
  return computed(() => {
    const value = bundle.value.bricks[brick]
    const def = schema.bricks[brick] as Brick | undefined
    if (value?.kind === 'collection' && def) {
      return { items: def.kind === 'collection' && def.route ? withUrl(value.items, bundle.value.locale, bundle.value.mainLocale) : value.items } as BrickValue<Bricks[K]>
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

/** Items of a core result get the `url` of the bundle's locale when the brick has a route (`withUrl`). */
function withRouteUrl(brick: string, items: BundleItem[], bundle: Bundle): BundleItem[] {
  const def = schema.bricks[brick] as Brick | undefined
  return def?.kind === 'collection' && def.route ? withUrl(items, bundle.locale, bundle.mainLocale) : items
}

/**
 * Query a collection (SPEC 2.1 / core `query`): where, order, limit, page, facets. It runs over the visible
 * entries in the client state, so a hidden entry is neither in `items` nor in `total`. `q` may be a ref or
 * getter (a page number from the route), and the result follows it.
 */
export function useGinkoQuery<K extends CollectionKey>(brick: K, q: MaybeRefOrGetter<Query<GinkoData<K>>> = {}): ComputedRef<Omit<QueryResult, 'items'> & { items: GinkoItem<K>[] }> {
  const bundle = useVisibleBundle([brick])
  return computed(() => {
    const result = query(bundle.value, brick, toValue(q) as Query, schema)
    // The core returns bundle items; their typed shape is the brick's GinkoItem (same cast as useGinko).
    return { ...result, items: withRouteUrl(brick, result.items, bundle.value) } as never
  })
}

/** The entries before and after `id` among the visible ones, in `options.order` (the `Query` order) or bundle order. */
export function useGinkoNeighbors<K extends CollectionKey>(brick: K, id: MaybeRefOrGetter<string>, options: Pick<Query<GinkoData<K>>, 'order'> = {}): ComputedRef<{ prev?: GinkoItem<K>; next?: GinkoItem<K> }> {
  const bundle = useVisibleBundle([brick])
  return computed(() => {
    const { prev, next } = neighbors(bundle.value, brick, toValue(id), options.order as Query['order'])
    const one = (item?: BundleItem) => item && withRouteUrl(brick, [item], bundle.value)[0]
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
 * The visible entry whose slug in the current locale is `slug`; otherwise a real 404 (SPEC 8). An entry without a
 * page in this locale (untranslated) is a 404 too, also when a list links it to its main-language page. `slug` may be a
 * getter such as `() => route.params.slug`, so a reused page follows client navigation; an array (catch-all
 * route) is joined with `/`. The 404 is thrown on every read of the value while no entry matches, not at the call.
 */
export function useGinkoEntry<K extends CollectionKey>(brick: K, slug: MaybeRefOrGetter<string | string[] | undefined>): Readonly<Ref<GinkoItem<K>>> {
  const items = useGinko(brick)
  const locale = useGinkoLocale()
  const entry = computed(() => {
    const def = schema.bricks[brick]!
    const route = def.kind === 'collection' ? def.route?.[locale.value] : undefined
    const value = toValue(slug)
    const path = value === undefined ? undefined : route?.replace('[slug]', Array.isArray(value) ? value.join('/') : value)
    return (items.value as { items: BundleItem[] }).items.find((i) => path && i.urls?.[locale.value] === path)
  })
  // A getter ref, not a computed that throws: such a computed throws only on the first read after a change and then
  // returns its last value. When other code reads the entry before the template (such as the useAsyncData key of
  // useGinkoMarkdown, a sync watcher), the template would get the old entry instead of the 404.
  return toRef(() => {
    const item = entry.value
    // Fatal: on the client, Nuxt opens the error page only for a fatal error, so a navigation to a missing slug shows the 404.
    if (!item) throw createError({ statusCode: 404, statusMessage: 'Not found', fatal: true })
    return item as never
  })
}

export interface GinkoSeoInput {
  title?: string
  /** `false` uses `title` as written, without the site's `seo.titleTemplate`: for a title that already names the site. */
  titleTemplate?: false
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
 * With nuxt-schema-org the page's JSON-LD joins that module's graph, which brings WebSite, WebPage and
 * the organization (nuxt-seo.ts), so nothing is written twice.
 */
export function useGinkoSeo(input: MaybeRefOrGetter<GinkoSeoInput>): void {
  const config = useRuntimeConfig().public.ginko as GinkoPublicConfig
  const locale = useGinkoLocale()
  const path = useGinkoPath()
  const route = useRoute()
  const i18n = useI18n()
  const absolute = (src: string) => (/^https?:\/\//.test(src) ? src : new URL(src, config.url).href)
  const withAbsolute = <T>(node: T) => withAbsoluteImages(node, config.url)
  // Images of the site itself stay paths: nuxt-og-image reads them from the site, not from its public address.
  const cardImage = (raw: GinkoSeoInput['image'] | string | undefined) => (raw === undefined ? '' : typeof raw === 'string' ? raw : raw.url)
  // With nuxt-og-image installed, every page gets a generated card with the page's image in it (the site's
  // default `seo.image` gives way to it).
  const generated = defineOgImage !== undefined && ogTemplate !== undefined
  if (defineOgImage && ogTemplate) {
    const { seo } = config
    defineOgImage(ogTemplate, {
      title: () => toValue(input).title ?? config.name,
      description: () => toValue(input).description ?? seo.description ?? '',
      siteName: config.name,
      section: () => toValue(input).section ?? '',
      image: () => cardImage(toValue(input).image),
      logo: cardImage(seo.organization?.logo),
      color: seo.color ?? '',
    }, {
      // The image's alt text describes the card, which shows that image.
      alt: () => { const image = toValue(input).image; return (typeof image === 'object' ? image.alt : undefined) ?? toValue(input).title ?? config.name },
      // A card with a photo is a JPEG: as PNG it weighs 400-700 KB, and WhatsApp drops preview images over about 300 KB.
      // A card of text and colour stays PNG, which keeps it sharp and small.
      extension: cardImage(toValue(input).image) ? 'jpeg' : 'png',
    })
  }
  // With nuxt-schema-org the page's JSON-LD joins that module's graph; `@context` belongs to the graph, not to a node.
  // The page's JSON-LD with the site's `country` where a builder left it out (siteJsonLd, jobJsonLd).
  const pageLd = () => (toValue(input).jsonLd ?? []).map((node) => withCountry(withAbsolute(node), config.country))
  if (useSchemaOrg) useSchemaOrg(computed(() => pageLd().map(({ '@context': _context, ...node }) => node)))
  const trim = (p: string) => (p.length > 1 ? p.replace(/\/$/, '') : p)
  useHead(() => {
    const page = toValue(input)
    const { seo } = config
    const raw = generated ? undefined : (page.image ?? seo.image)
    const image = raw === undefined ? undefined : typeof raw === 'string' ? { url: absolute(raw) } : { ...raw, url: absolute(raw.url) }
    const head = seoHead({ siteName: config.name, titleTemplate: page.titleTemplate ?? seo.titleTemplate, title: page.title, description: page.description ?? seo.description, image, type: page.type, noindex: page.noindex })
    const ld = useSchemaOrg ? [] : pageLd()
    // The home page is the page whose main-language path is `/`.
    const home = Object.keys(schema.pages).find((key) => schema.pages[key]?.[config.mainLocale] === '/')
    if (!useSchemaOrg && home !== undefined && trim(route.path) === trim(path(home as GinkoPageKey, locale.value))) {
      const lang = i18n.locales.find((l) => l.code === locale.value)?.language ?? locale.value
      ld.unshift(websiteLd({ name: config.name, url: config.url, lang }))
      // A page that writes its own organisation node (`siteJsonLd` of the `site()` brick) has the one with the address
      // and contact: a second node from `seo.organization` would describe the same organisation twice.
      const own = ld.some((node) => (ORGANIZATION_TYPES as readonly unknown[]).includes(node['@type']))
      if (seo.organization && !own) ld.splice(1, 0, organizationLd({ name: config.name, url: config.url, ...seo.organization, logo: seo.organization.logo && absolute(seo.organization.logo) }))
    }
    return {
      title: head.title,
      // The title is complete (seo.titleTemplate is applied above): no template of the site or of
      // nuxt-seo-utils may add the site name a second time.
      titleTemplate: null,
      // A generated card is large: nuxt-og-image writes `twitter:card` with its image, so ours (`summary`, no image) stays out.
      meta: generated ? head.meta.filter((m) => !('name' in m && m.name === 'twitter:card')) : head.meta,
      // `<` is escaped so a value such as "</script>" cannot end the script element.
      script: ld.map((entry, i) => ({ key: `ginko-ld-${i}`, type: 'application/ld+json', innerHTML: JSON.stringify(entry).replace(/</g, '\\u003c') })),
    }
  })
}
