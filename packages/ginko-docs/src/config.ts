// The bricks for ginko.config.ts. Docs pages live at <base>/<slug> in every language (main language
// unprefixed); the layer serves its page at that address. The start page, the blog and the changelog are optional.
import { collection, f, single, type Locale } from '@lupinum/ginko'

type Locales = readonly [Locale, ...Locale[]]

// The layer's fixed addresses and the locale rule, shared with the page module and the app. The main language has
// no prefix; every other language gets `/<locale>` in front (ginko-i18n's rule).
export const BLOG_PATH = '/blog'
export const CHANGELOG_PATH = '/changelog'

/** `path` in every language: `{ en: '/blog', de: '/de/blog' }` when `en` is the main language. */
export function localized(locales: readonly Locale[], path: string): Partial<Record<Locale, string>> {
  const [main] = locales
  return Object.fromEntries(locales.map((l) => [l, l === main ? path : `/${l}${path}`]))
}

/** `base`: where the docs live, default `/docs` (e.g. `/handbook` inside a larger site). */
export function docsCollection(locales: Locales, opts: { label?: string; max?: number; base?: `/${string}` } = {}) {
  const base = opts.base ?? '/docs'
  return collection({
    label: opts.label ?? 'Doku',
    source: 'files',
    max: opts.max ?? 500,
    order: 'manual',
    route: localized(locales, `${base}/[slug]`),
    fields: {
      title: f.text('Titel'),
      description: f.longtext('Beschreibung', { optional: true }),
      /** Starts a group in the side navigation under this heading; the pages after it belong to it until the next one. */
      section: f.text('Abschnitt', { optional: true }),
      /** Nests the entry under another doc in the side navigation and the breadcrumbs. */
      parent: f.ref('Übergeordnete Seite', 'docs', { optional: true }),
      /** Section tab above the side navigation; a page without one follows the tab of the page before it. Children follow their parent. */
      tab: f.text('Reiter', { optional: true, max: 30 }),
      /** A short label next to the entry in the side navigation, e.g. „Neu“. */
      badge: f.text('Kennzeichen', { optional: true, max: 20 }),
      /** An icon name such as `lucide:book-open` (any installed Iconify set), shown before the title in the side navigation. */
      icon: f.text('Symbol', { optional: true, max: 60, translate: false }),
      slug: f.slug('Adresse', { from: 'title' }),
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
    label: 'Startseite',
    source: 'files',
    fields: {
      title: f.text('Titel', { max: 120 }),
      description: f.longtext('Beschreibung', { optional: true, max: 400 }),
      /** A command shown with a copy button, e.g. `pnpm add @lupinum/ginko`. */
      install: f.text('Installationsbefehl', { optional: true, max: 200, translate: false }),
      /** Buttons under the description; the first one is the main one. */
      links: f.list('Links', 'Link', { label: f.text('Text', { max: 40 }), href: f.text('Ziel', { max: 300 }) }, { max: 2, default: [] }),
      features: f.list('Merkmale', 'Merkmal', {
        icon: f.text('Symbol', { optional: true, max: 60, translate: false }),
        title: f.text('Titel', { max: 80 }),
        description: f.longtext('Beschreibung', { max: 300 }),
        href: f.text('Link', { optional: true, max: 300 }),
      }, { max: 12, default: [] }),
      body: f.markdown('Text', { profile: 'page', optional: true }),
    },
  })
}

/**
 * The optional blog: `{ posts, authors }`, spread into `bricks` in ginko.config.ts. Posts live at
 * /blog/<slug> (main language unprefixed, `/<l>/blog/<slug>` otherwise) and come out newest first.
 * Authors have no page; a post names them in `authors`. Files: `content/posts/<n>.<name>[.<locale>].md`
 * and `content/authors/<name>[.<locale>].yml`. Add `blog: blogPages(locales)` to `pages` as well.
 */
export function blogCollections(locales: Locales, opts: { max?: number } = {}) {
  return {
    posts: collection({
      label: 'Beiträge',
      source: 'files',
      max: opts.max ?? 500,
      order: { field: 'date', dir: 'desc' },
      route: localized(locales, `${BLOG_PATH}/[slug]`),
      fields: {
        title: f.text('Titel'),
        description: f.longtext('Beschreibung', { optional: true }),
        date: f.date('Datum'),
        authors: f.ref('Autoren', 'authors', { multiple: true, optional: true }),
        image: f.image('Bild', { optional: true }),
        tags: f.list('Schlagwörter', 'Schlagwort', { tag: f.text('Schlagwort', { max: 40 }) }, { max: 10, optional: true }),
        slug: f.slug('Adresse', { from: 'title' }),
        body: f.markdown('Text', { profile: 'page' }),
      },
    }),
    authors: collection({
      label: 'Autoren',
      source: 'files',
      max: 100,
      order: 'manual',
      fields: {
        name: f.text('Name'),
        role: f.text('Rolle', { optional: true }),
        avatar: f.image('Bild', { optional: true }),
        /** Shown as a link on the author's name. */
        url: f.text('Webseite', { format: 'url', optional: true }),
      },
    }),
  }
}

/**
 * The optional changelog: one page at /changelog with one entry per release, newest first. Entries have no
 * page of their own, the page links to each by anchor. Files: `content/changelog/<name>[.<locale>].md`
 * with `version` and `date` in the frontmatter (a dot in the name would read as a language: use `v1-2-0.md`). Add `changelog: changelogPages(locales)` to `pages` as well.
 */
export function changelogCollection() {
  return collection({
    label: 'Änderungen',
    source: 'files',
    max: 500,
    order: { field: 'date', dir: 'desc' },
    fields: {
      version: f.text('Version', { max: 40, translate: false }),
      date: f.date('Datum'),
      body: f.markdown('Text', { profile: 'page' }),
    },
  })
}

/** The list pages by locale, for `pages` in ginko.config.ts: the sitemap and the static build know them from there. */
export const blogPages = (locales: Locales) => localized(locales, BLOG_PATH)
export const changelogPages = (locales: Locales) => localized(locales, CHANGELOG_PATH)
