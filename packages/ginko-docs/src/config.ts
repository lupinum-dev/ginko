// The bricks for ginko.config.ts. Docs pages live at <base>/<slug> in every language (main language
// unprefixed); the layer serves its page at that address. The start page, the blog and the changelog are optional.
import { collection, f, single, type Locale } from '@lupinum/ginko'
import { BLOG_PATH, CHANGELOG_PATH } from '../shared/paths.ts'

/** The registry of the Markdown components the layer renders, for `components` in `defineSite`. */
export { components } from '@lupinum/ginko-components/registry'

/** The site's languages, main language first. The same list as `locales` in `defineSite`, as a plain array or a tuple. */
type Locales = readonly Locale[]

/**
 * `path` in every language: `{ en: '/blog', de: '/de/blog' }` when `en` is the main language. The main language has no
 * prefix; every other language gets `/<locale>` in front (ginko-i18n's rule).
 */
function localized<P extends `/${string}`>(locales: Locales, path: P): Record<Locale, P> {
  const [main] = locales
  if (main === undefined) throw new Error('[ginko-docs] `locales` is empty. Fix: pass the same list as `locales` in defineSite.')
  // `/<locale>` + a path still matches the path's pattern, e.g. `/${string}/[slug]`.
  return Object.fromEntries(locales.map((l) => [l, l === main ? path : `/${l}${path}`])) as Record<Locale, P>
}

/** `base`: where the docs live, default `/docs` (e.g. `/handbook` inside a larger site). */
export function docsCollection(opts: { locales: Locales; label?: string; max?: number; base?: `/${string}` }) {
  const { locales } = opts
  const base = opts.base ?? '/docs'
  return collection({
    label: opts.label ?? 'Docs',
    source: 'files',
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
 * may use every component. Without it, `/` opens the first docs page. Add `home: { <main>: '/', <l>: '/<l>' }` to `pages`.
 */
export function docsHome() {
  return single({
    label: 'Start page',
    source: 'files',
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
 * /blog/<slug> (main language unprefixed, `/<l>/blog/<slug>` otherwise) and come out newest first.
 * Authors have no page; a post names them in `authors`. Files: `content/posts/<n>.<name>[.<locale>].md`
 * and `content/authors/<name>[.<locale>].yml`. Add `blog: blogPages({ locales })` to `pages` as well.
 */
export function blogCollections(opts: { locales: Locales; max?: number }) {
  const { locales } = opts
  return {
    posts: collection({
      label: 'Posts',
      source: 'files',
      max: opts.max ?? 500,
      order: { field: 'date', dir: 'desc' },
      route: localized(locales, `${BLOG_PATH}/[slug]`),
      fields: {
        title: f.text('Title'),
        description: f.longtext('Description', { optional: true }),
        date: f.date('Date'),
        authors: f.refs('Authors', { to: 'authors', optional: true }),
        image: f.image('Image', { optional: true }),
        tags: f.list('Tags', { itemLabel: 'Tag', fields: { tag: f.text('Tag', { max: 40 }) }, max: 10, optional: true }),
        slug: f.slug('Address', { from: 'title' }),
        body: f.markdown('Text', { profile: 'page' }),
      },
    }),
    authors: collection({
      label: 'Authors',
      source: 'files',
      max: 100,
      order: 'manual',
      fields: {
        name: f.text('Name'),
        role: f.text('Role', { optional: true }),
        avatar: f.image('Image', { optional: true }),
        /** Shown as a link on the author's name. */
        url: f.text('Website', { format: 'url', optional: true }),
      },
    }),
  }
}

/**
 * The optional changelog: one page at /changelog with one entry per release, newest first. Entries have no
 * page of their own, the page links to each by anchor. Files: `content/changelog/<name>[.<locale>].md`
 * with `version` and `date` in the frontmatter (a dot in the name would read as a language: use `v1-2-0.md`). Add `changelog: changelogPages({ locales })` to `pages` as well.
 */
export function changelogCollection(opts: { max?: number } = {}) {
  return collection({
    label: 'Changelog',
    source: 'files',
    max: opts.max ?? 500,
    order: { field: 'date', dir: 'desc' },
    fields: {
      version: f.text('Version', { max: 40, translate: false }),
      date: f.date('Date'),
      body: f.markdown('Text', { profile: 'page' }),
    },
  })
}

/** The list pages by locale, for `pages` in ginko.config.ts: the sitemap and the static build know them from there. */
export const blogPages = (opts: { locales: Locales }) => localized(opts.locales, BLOG_PATH)
export const changelogPages = (opts: { locales: Locales }) => localized(opts.locales, CHANGELOG_PATH)
