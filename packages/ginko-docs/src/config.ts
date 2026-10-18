// The bricks for ginko.config.ts. Docs pages live at <base>/<slug> in every locale (main locale
// unprefixed); the layer serves its page at that address. The start page, the blog and the changelog are optional.
import { collection, f, single, type BrickSource, type Locale } from '@lupinum/ginko'
import { authors, changelog, posts } from '@lupinum/ginko/basics'
import { labelsIn } from '@lupinum/ginko/internal'
import { BLOG_PATH, CHANGELOG_PATH } from '../shared/paths.ts'

/** The registry of the Markdown components the layer renders, for `components` in `defineSite`. */
export { components } from '@lupinum/ginko-components/registry'

/** The site's locales, main locale first. The same list as `locales` in `defineSite`, as a plain array or a tuple. */
type Locales = readonly Locale[]

/**
 * Where a brick's content comes from: `'files'` (the default) reads Markdown from `content/`, `'platform'` keeps it on
 * the Ginko platform, where people edit it in Ginko Studio. Unlike the bricks of `@lupinum/ginko/basics`, docs bricks
 * read files unless they are told otherwise: docs usually live in Git.
 */
export type DocsSource = BrickSource | 'platform'

/** The brick's `source` key: `'files'` by default, none (the platform) for `'platform'`. */
const sourceOf = (source: DocsSource = 'files') => (source === 'files' ? { source } : {})

/**
 * `path` in every locale: `{ en: '/blog', de: '/de/blog' }` when `en` is the main locale. The main locale has no
 * prefix; every other locale gets `/<locale>` in front (ginko-i18n's rule).
 */
function localized<P extends `/${string}`>(locales: Locales, path: P): Record<Locale, P> {
  const [main] = locales
  if (main === undefined) throw new Error('[ginko-docs] `locales` is empty. Fix: pass the same list as `locales` in defineSite.')
  // `/<locale>` + a path still matches the path's pattern, e.g. `/${string}/[slug]`. The root of another locale is
  // `/<locale>` without a trailing slash, its canonical address (ginko-i18n redirects `/de/` to `/de`).
  const address: string = path
  return Object.fromEntries(locales.map((l) => [l, l === main ? path : address === '/' ? `/${l}` : `/${l}${path}`])) as Record<Locale, P>
}

/** `base`: where the docs live, default `/docs` (e.g. `/handbook` inside a larger site). `source`: see `DocsSource`. */
export function docsCollection(opts: { locales: Locales; label?: string; max?: number; base?: `/${string}`; source?: DocsSource }) {
  const { locales } = opts
  const base = opts.base ?? '/docs'
  return collection({
    label: opts.label ?? 'Docs',
    ...sourceOf(opts.source),
    max: opts.max ?? 500,
    order: 'manual',
    route: localized(locales, `${base}/[slug]`),
    fields: {
      title: f.text('Title'),
      description: f.longtext('Description', { optional: true }),
      /** Starts a group in the side navigation under this heading; the pages after it belong to it until the next one. */
      section: f.text('Section', { optional: true }),
      /** Nests the entry under another doc in the side navigation and the breadcrumbs. */
      parent: f.ref('Parent page', { to: 'docs', optional: true }),
      /** Section tab above the side navigation; a page without one follows the tab of the page before it. Children follow their parent. */
      tab: f.text('Tab', { optional: true, max: 30 }),
      /** A short label next to the entry in the side navigation, e.g. "New". */
      badge: f.text('Badge', { optional: true, max: 20 }),
      /** An icon name such as `lucide:book-open` (any installed Iconify set), shown before the title in the side navigation. */
      icon: f.text('Icon', { optional: true, max: 60, translate: false }),
      slug: f.slug('Address', { from: 'title' }),
      body: f.markdown('Text', { profile: 'page' }),
    },
  })
}

/**
 * The optional start page: one Markdown file `content/home[.<locale>].md`. The frontmatter fills the hero (title,
 * description, install command, up to two links) and the feature grid; the text below the frontmatter follows them and
 * may use every component. Without it, `/` opens the first docs page. Add `home: homePages({ locales })` to `pages`.
 * `source`: see `DocsSource`.
 */
export function docsHome(opts: { source?: DocsSource } = {}) {
  return single({
    label: 'Start page',
    ...sourceOf(opts.source),
    fields: {
      title: f.text('Title', { max: 120 }),
      description: f.longtext('Description', { optional: true, max: 400 }),
      /** A command shown with a copy button, e.g. `pnpm add @lupinum/ginko`. */
      install: f.text('Install command', { optional: true, max: 200, translate: false }),
      /** Buttons under the description; the first one is the main one. */
      links: f.list('Links', { itemLabel: 'Link', fields: { label: f.text('Text', { max: 40 }), href: f.text('Target', { max: 300 }) }, max: 2, default: [] }),
      features: f.list('Features', {
        itemLabel: 'Feature',
        fields: {
          icon: f.text('Icon', { optional: true, max: 60, translate: false }),
          title: f.text('Title', { max: 80 }),
          description: f.longtext('Description', { max: 300 }),
          href: f.text('Link', { optional: true, max: 300 }),
        },
        max: 12, default: [],
      }),
      body: f.markdown('Text', { profile: 'page', optional: true }),
    },
  })
}

/**
 * The optional blog: `{ posts, authors }`, spread into `bricks` in ginko.config.ts. Posts live at
 * /blog/<slug> (main locale unprefixed, `/<l>/blog/<slug>` otherwise) and come out newest first.
 * Authors have no page; a post names them in `authors`. Files: `content/posts/<n>.<name>[.<locale>].md`
 * and `content/authors/<name>[.<locale>].yml`. Add `blog: blogPages({ locales })` to `pages` as well.
 * The bricks are `posts()` and `authors()` of `@lupinum/ginko/basics` with the English labels docs sites store.
 * `source` (both bricks): see `DocsSource`.
 */
export function blogCollections(opts: { locales: Locales; max?: number; source?: DocsSource }) {
  const { locales } = opts
  return {
    posts: labelsIn(posts({ ...sourceOf(opts.source), max: opts.max, route: localized(locales, `${BLOG_PATH}/[slug]`) }), 'en'),
    authors: labelsIn(authors(sourceOf(opts.source)), 'en'),
  }
}

/**
 * The optional changelog: one page at /changelog with one entry per release, newest first. Entries have no
 * page of their own, the page links to each by anchor. Files: `content/changelog/<name>[.<locale>].md`
 * with `version` and `date` in the frontmatter (a dot in the name would read as a language: use `v1-2-0.md`). Add `changelog: changelogPages({ locales })` to `pages` as well.
 * The brick is `changelog()` of `@lupinum/ginko/basics` with the English labels docs sites store. `source`: see
 * `DocsSource`.
 */
export function changelogCollection(opts: { max?: number; source?: DocsSource } = {}) {
  return labelsIn(changelog({ ...sourceOf(opts.source), max: opts.max }), 'en')
}

/** The start page by locale, for `pages` in ginko.config.ts: the main locale at `/`, the others at `/<locale>`. */
export const homePages = (opts: { locales: Locales }) => localized(opts.locales, '/')

/** The list pages by locale, for `pages` in ginko.config.ts: the sitemap and the static build know them from there. */
export const blogPages = (opts: { locales: Locales }) => localized(opts.locales, BLOG_PATH)
export const changelogPages = (opts: { locales: Locales }) => localized(opts.locales, CHANGELOG_PATH)
