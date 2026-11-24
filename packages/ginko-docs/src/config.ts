// The bricks for ginko.config.ts, as patterns: each function returns a brick of the written form, so a site changes it
// with `extend` of '@lupinum/ginko'. The address of a docs page is a line in the site's `entries`
// (`entries: { docs: '/docs/[slug]' }`); the layer serves its page there. Where a brick lives is `studio.bricks`. The
// start page, the blog and the changelog are optional. Each brick is made from a private builder of the stored form
// and turned into the written form by `defOf`, so its stored model is exactly what it was.
import { authorsBrick, changelogBrick, collection, defOf, f, labelsIn, postsBrick, single, type Locale } from '@lupinum/ginko/internal'
import { BLOG_PATH, CHANGELOG_PATH } from '../shared/paths.ts'

/** The registry of the Markdown components the layer renders, for `components` in `defineSite`. */
export { components } from '@lupinum/ginko-components/registry'

/** The site's locales, main locale first. The same list as `locales` in `defineSite`, as a plain array or a tuple. */
type Locales = readonly Locale[]

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

/** A label in the languages of the Studio, so editors read the fields in their language (de, en, es, fr). */
const l = (de: string, en: string, es: string, fr: string) => ({ de, en, es, fr })
const NAVIGATION = l('Navigation', 'Navigation', 'Navegación', 'Navigation')

/**
 * The docs pages. Their address is a line in `entries`: `docs: '/docs/[slug]'` (or `/handbook/[slug]` inside a larger
 * site). `navExtras: false` leaves out Tab, Badge and Icon, which most sites do not use: editors then see only the text
 * and where the page sits (section, parent page, short title). `brick`: the key of this brick in `bricks`, default
 * `docs`; a site that names it otherwise (`wissen`) sets the same key as `ginkoDocs: { brick }` in nuxt.config.ts.
 */
export function docsCollection(opts: { label?: string; max?: number; navExtras?: boolean; brick?: string } = {}) {
  return defOf(storedDocs(opts), { item: l('Seite', 'a page', 'una página', 'une page') })
}

function storedDocs(opts: { label?: string; max?: number; navExtras?: boolean; brick?: string }) {
  return collection({
    label: opts.label ?? 'Docs',
    listing: { title: 'title' },
    untranslated: 'hide',
    // The side navigation: pages nest by `parent`, `section` starts a heading, `navTitle` is the short name; `tab` starts a
    // tab and `badge` shows a badge (both left out with `navExtras: false`).
    tree: { parent: 'parent', section: 'section', label: 'navTitle', ...(opts.navExtras !== false ? { tab: 'tab', badge: 'badge' } : {}) },
    max: opts.max ?? 500,
    order: 'manual',
    body: 'body',
    fields: withExtras(opts.navExtras !== false, {
      title: f.text(l('Titel', 'Title', 'Título', 'Titre')),
      description: f.longtext(l('Beschreibung', 'Description', 'Descripción', 'Description'), { optional: true }),
      body: f.markdown(l('Text', 'Text', 'Texto', 'Texte'), { profile: 'page' }),
      /** The page's name in the side navigation, the breadcrumbs and the previous/next links, when the title is too long there. */
      navTitle: f.text(l('Kurztitel', 'Short title', 'Título corto', 'Titre court'), {
        optional: true, max: 60, group: NAVIGATION,
        hint: l('Statt des Titels in der Navigation', 'Shown instead of the title in the navigation', 'Se muestra en la navegación en lugar del título', 'Affiché dans la navigation à la place du titre'),
      }),
      /** Starts a group in the side navigation under this heading; the pages after it belong to it until the next one. */
      section: f.text(l('Abschnitt', 'Section', 'Sección', 'Section'), {
        optional: true, group: NAVIGATION,
        hint: l('Beginnt eine Gruppe in der Navigation; die folgenden Seiten gehören dazu', 'Starts a group in the navigation; the pages after it belong to it', 'Empieza un grupo en la navegación; las páginas siguientes pertenecen a él', 'Commence un groupe dans la navigation ; les pages suivantes en font partie'),
      }),
      /** Nests the entry under another doc in the side navigation and the breadcrumbs. */
      parent: f.ref(l('Übergeordnete Seite', 'Parent page', 'Página superior', 'Page parente'), { to: opts.brick ?? 'docs', optional: true, group: NAVIGATION }),
      /** Section tab above the side navigation; a page without one follows the tab of the page before it. Children follow their parent. */
      tab: f.text(l('Reiter', 'Tab', 'Pestaña', 'Onglet'), { optional: true, max: 30, group: NAVIGATION }),
      /** A short label next to the entry in the side navigation, e.g. "New". */
      badge: f.text(l('Badge', 'Badge', 'Insignia', 'Badge'), { optional: true, max: 20, group: NAVIGATION }),
      /** An icon name such as `lucide:book-open` (any installed Iconify set), shown before the title in the side navigation. */
      icon: f.text(l('Symbol', 'Icon', 'Icono', 'Icône'), { optional: true, max: 60, translate: false, group: NAVIGATION, hint: 'lucide:book-open' }),
      slug: f.slug(l('Adresse', 'Address', 'Dirección', 'Adresse'), { from: 'title' }),
    }),
  })
}

/**
 * The fields, without Tab, Badge and Icon unless `extras`. The type keeps them: all three are optional, so the data type
 * (`tab?: string`) is true whether the field exists or not, and the layer reads them the same way.
 */
function withExtras<F extends { tab: unknown; badge: unknown; icon: unknown }>(extras: boolean, fields: F): F {
  if (extras) return fields
  const { tab: _tab, badge: _badge, icon: _icon, ...rest } = fields
  return rest as unknown as F
}

/**
 * The optional start page: one Markdown file `content/home[.<locale>].md`. The frontmatter fills the hero (title,
 * description, install command, up to two links) and the feature grid; the text below the frontmatter follows them and
 * may use every component. Without it, `/` opens the first docs page. Add `home: '/'` to `pages`.
 */
export function docsHome() {
  return defOf(storedHome())
}

function storedHome() {
  return single({
    label: 'Start page',
    body: 'body',
    fields: {
      title: f.text('Title', { max: 120, default: 'Documentation' }),
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
 * The optional blog: `{ posts, authors }`, spread into `bricks` in ginko.config.ts. Posts come out newest first; their
 * page is a line in `entries`: `posts: '/blog/[slug]'`. Authors have no page; a post names them in `authors`. Files:
 * `content/posts/<n>.<name>[.<locale>].md` and `content/authors/<name>[.<locale>].yml`. Add `blog: '/blog'` to `pages`
 * as well. The bricks are the `posts` and `authors` patterns with the English labels docs sites store.
 */
export function blogCollections(opts: { max?: number } = {}) {
  return {
    posts: defOf(labelsIn(postsBrick({ max: opts.max }), 'en'), { item: 'a post' }),
    authors: defOf(labelsIn(authorsBrick(), 'en'), { item: 'an author' }),
  }
}

/**
 * The optional changelog: one page at /changelog with one entry per release, newest first. Entries have no
 * page of their own, the page links to each by anchor. Files: `content/changelog/<name>[.<locale>].md`
 * with `version` and `date` in the frontmatter (a dot in the name would read as a language: use `v1-2-0.md`). Add
 * `changelog: '/changelog'` to `pages` as well. The brick is the `changelog` pattern with the English labels docs
 * sites store.
 */
export function changelogCollection(opts: { max?: number } = {}) {
  return defOf(labelsIn(changelogBrick({ max: opts.max }), 'en'), { item: 'a release' })
}

/** The start page by locale, for `pages` in ginko.config.ts: the main locale at `/`, the others at `/<locale>`. */
export const homePages = (opts: { locales: Locales }) => localized(opts.locales, '/')

/** The list pages by locale, for `pages` in ginko.config.ts: the sitemap and the static build know them from there. */
export const blogPages = (opts: { locales: Locales }) => localized(opts.locales, BLOG_PATH)
export const changelogPages = (opts: { locales: Locales }) => localized(opts.locales, CHANGELOG_PATH)
