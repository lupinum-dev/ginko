# @lupinum/ginko-docs

A Nuxt layer for documentation sites on [`@lupinum/ginko`](https://github.com/lupinum-dev/ginko/tree/main/packages/ginko)
and [`@lupinum/ginko-content`](https://github.com/lupinum-dev/ginko/tree/main/packages/ginko-content):
a whole docs site with a start page, navigation, search, blog and changelog, or docs inside a site that already exists
(see "Inside an existing site"). The Markdown components (callouts, tabs, steps, cards,
code blocks and more) come from `@lupinum/ginko-components`. Math (`$x^2$`, `$$…$$`) renders with KaTeX and `mermaid` code fences as diagrams; both load only on pages that use them. Pages are Markdown files in `content/docs/`.

## Use

```bash
npm install @lupinum/ginko @lupinum/ginko-content @lupinum/ginko-i18n @lupinum/ginko-docs
```

```ts
// ginko.config.ts
import { defineSite } from '@lupinum/ginko'
import { components, docsCollection, homePages } from '@lupinum/ginko-docs/config'

const locales = ['en', 'de'] as const

export default defineSite({
  site: 'my-docs',
  name: 'My docs',
  url: 'https://docs.example.com',
  timeZone: 'Europe/Vienna',
  locales,
  currency: 'EUR',
  pages: { home: homePages({ locales }) }, // the start page is the page `home`
  components, // the Markdown components: ::callout, ::tabs, ::steps …
  bricks: { docs: docsCollection({ locales }) },
})
```

`docsCollection`, `blogCollections`, `homePages`, `blogPages` and `changelogPages` take one options object. `locales` is the same list as
in `defineSite` (the layer accepts any `readonly string[]`; `defineSite` itself needs the tuple, hence `as const`).

The bricks read Markdown files from `content/`. To edit them in Ginko Studio instead, pass `source: 'platform'` to
`docsCollection`, `docsHome`, `blogCollections` or `changelogCollection` (each brick on its own; the default is
`'files'`). The pages, their Markdown twins, the search (the search box and `search_docs`) and `read_doc` work the
same with either source: with platform bricks the site's server builds the search index from the published content
and renews it like a page, so a page published in the Studio is found within a minute. A page from the platform links
"Edit this page" to its form in the Studio. One thing is built from files only: an icon named only in Studio content
is not bundled (name it once in a file the icon scan reads, see "Icons").

`components` is the registry of `@lupinum/ginko-components` (a dependency of the layer, re-exported here). With it, Ginko checks every component tag and prop in the
pages; a site can add its own components next to it (see "Inside an existing site").

Limits of the layer:

- It finds its content by brick key, so keep these names: `docs` (docsCollection), `home` (docsHome), `posts` and
  `authors` (blogCollections), `changelog` (changelogCollection). Only `docs` is required. One site has one docs
  collection.
- The docs move with `base`; the blog is always at `/blog` and the changelog at `/changelog` (with the language
  prefix in other languages, for example `/de/blog`).

```ts
// nuxt.config.ts
import ginko from './ginko.config.ts'

export default defineNuxtConfig({ extends: ['@lupinum/ginko-docs'], modules: ['@lupinum/ginko/nuxt'], ginko })
```

## Configure

Options go in the site's `app.config.ts`. All are optional. Internal paths in `nav`, `footer.links` and `banner.href`
follow the reader's language (`/guide` becomes `/de/guide`); absolute URLs stay as written. A route link names the page
instead of its address, as in Markdown: `$docs.<page>` (a docs page by its file name, such as `$docs.webhooks`, or its
slug) and `$page.<key>` (a page of `pages` in `ginko.config.ts`, such as `$page.changelog`), with an optional `#anchor`.
It leads to the page in the reader's language, also when a translation has another slug.

```ts
export default defineAppConfig({
  docs: {
    title: 'My docs',                                   // header text, next to the logo (default: `name` from ginko.config.ts)
    logo: { light: '/logo.svg', dark: '/logo-dark.svg' }, // `wordmark: true` when the image holds the name
    theme: 'green',                                     // colour preset: 'default' (emerald on zinc) or 'green' (green on slate)
    nav: [{ id: 'guide', href: '/guide' }],             // header links after Docs, Blog, Changelog
    social: [{ icon: 'docs:github', href: 'https://github.com/me/docs', label: 'GitHub' }],
    banner: { id: 'v2', href: '/docs/changes' },        // dismissible notice above the header; `href` optional
    repository: { url: 'https://github.com/me/docs', branch: 'main' }, // "Edit this page" and "Report an issue"
    markdownActions: { copy: true, openIn: ['chatgpt', 'claude'] },     // "Copy page" and the chats of its menu (the defaults)
    footer: {
      links: [{ id: 'github', href: 'https://github.com/me/docs' }],
      attribution: true,                                // "Built with Ginko", default true
    },
  },
})
```

Texts are not part of the config, they come from the site's own messages (`i18n/<code>.json`), so every
language has its own:

```json
{ "docs": { "banner": { "v2": "Version 2 is out." }, "nav": { "guide": "Guide" }, "footer": { "github": "GitHub" } } }
```

- `docs` is a reserved message namespace: keep your own messages out of it. Only `docs.nav.<id>`, `docs.footer.<id>` and `docs.banner.<id>` are yours to set; the other `docs.*` keys are the layer's own texts.
- `banner.id` picks the message `docs.banner.<id>`. A reader who closes the banner does not see it again (it is remembered in `localStorage`, and the page gets `data-docs-banner-off` on `<html>`); a new `id` shows it to everyone.
- Each `nav` and footer link `id` picks the message `docs.nav.<id>` or `docs.footer.<id>`.
- `social` icons are any Iconify name. Built in: `docs:github`, `docs:discord`, `docs:x`, `docs:bluesky`, `docs:mastodon`, `docs:linkedin`, `docs:youtube`.
- `repository` adds "Edit this page" to every page that comes from a file (`<url>/edit/<branch>/<source>`; `branch` defaults to `main`)
  and, for GitHub, "Report an issue". `editUrl` (`{url}`, `{branch}`, `{source}`) and `issueUrl` (`{url}`, `{title}`, `{page}`) are templates for other hosts. Pages stored on the Ginko platform (not in files) link to
  their form in the Studio instead, at the site's platform address.
- Every page shows "Last updated" from the entry's `updatedAt`, and its JSON-LD is a `TechArticle` with `dateModified`.
- "Copy page" copies the page as Markdown; its menu opens the `.md` twin, or ChatGPT or Claude with a prompt that points at it.
- The layer also serves a read-only [MCP](https://modelcontextprotocol.io) endpoint at `POST /__ginko/docs-mcp` (Streamable HTTP, JSON-RPC)
  with the tools `search_docs(query, locale?)` and `read_doc(path)`. No auth, no rate limit: it only exposes what the public site shows.

### Pages

Each docs page's frontmatter can set, besides `title` and `description`:

| Field | Effect |
| --- | --- |
| `navTitle` | A short title for the side navigation, the breadcrumbs and the previous/next links, when the title is too long there. |
| `section` | Starts a group in the side navigation with this heading; the pages after it belong to it until the next `section`. |
| `tab` | Starts a tab above the side navigation (for example "Guide" and "Reference"); pages follow the tab before them. |
| `parent` | Nests the page under another one (`parent: docs/<name>`: the entry id, the file name without number, locale and extension). |
| `icon` | An Iconify name, e.g. `lucide:rocket`, before the title in the navigation. Main locale only. |
| `badge` | A short label after the title, e.g. "New". |

`docsCollection({ locales, navExtras: false })` leaves out `tab`, `badge` and `icon` for sites that use none of them, so
editors in the Studio see only the text and where the page sits.

### Icons

The layer draws icons itself (no `@nuxt/icon`, no icon API call, no icon library in the browser). At build time it reads
exactly the icons your site names from the installed `@iconify-json/<set>` packages (`lucide` is installed with the
layer; add others with `pnpm add -D @iconify-json/<set>`) and bundles them in one small map that only docs pages load.

The build scans, in all locales:

- the front matter of your Markdown files, the attributes of Markdown components (`::card{icon="lucide:rocket"}`) and the
  `---` block inside a component; prose and code blocks are not read;
- YAML and JSON content files and `app.config.ts` (`icon:` values and `social`);
- the layer's own components and your site's `app/**/*.vue` files (`<Icon name="lucide:x" />`, `icon="..."`, or a bound
  literal `:name="'lucide:x'"`). Commented-out code is ignored; other `.ts` files than `app.config.ts` are not read.

A name is `set:name`; a bare name such as `book-open` means Lucide. The `i-set-name` form is not supported. Names built at
runtime (a variable, a template string) are not found; write the name once as a literal somewhere in the places above. A
name the build cannot find logs one warning with its file and renders nothing.

The layer registers a global `Icon` component that the Markdown components (card, tabs, callout) use. If your site installs
`@nuxt/icon` itself, yours wins (the layer's has a lower priority).

### Start page (optional)

`docsHome()` adds a `home` brick: one file `content/home.md` (and `home.<locale>.md`). Its frontmatter fills the hero
and the feature grid, the text below it follows them:

```md
---
title: Docs for my library.
description: One sentence on what it does.
install: npm install my-library
links:
  - { label: Get started, href: /docs/introduction }
  - { label: GitHub, href: https://github.com/me/lib }
features:
  - { icon: lucide:zap, title: Fast, description: Why it is fast., href: /docs/speed }
---
```

`href` takes a path as written, an absolute URL, or a route link (`$docs.introduction`, `$page.changelog`) that follows
the reader's language, so the translations (`home.<locale>.md`) can use the same links.

Add `home: docsHome()` to `bricks`. Without it, `/` leads to the first docs page. A site's own `pages/index.vue` wins.

### Look and colours

The layer is plain CSS. Colours, radius and fonts are shadcn-style tokens, the same ones
`@lupinum/ginko-components` reads: `--background`, `--foreground`, `--muted`, `--muted-foreground`, `--accent`,
`--border`, `--primary`, `--primary-foreground`, `--card`, `--popover`, `--ring`, `--radius`, `--font-sans`,
`--font-mono`. The layer's defaults sit in `@layer theme` with zero specificity, so any value the site sets wins,
unlayered or through Tailwind 4's `@theme`:

```css
/* assets/site.css */
:root {
  --primary: light-dark(#2f6f4f, #7cc59d);
  --primary-foreground: light-dark(#fff, #0c1f15);
  --font-sans: 'Inter', system-ui, sans-serif;
}
```

The defaults are `light-dark(light, dark)` pairs. The header switch stores the reader's choice in `localStorage`
(key `docs-color-mode`) and sets `data-theme="light|dark"` on `<html>`; a small inline script applies it before the first paint. A `.dark` class
on `<html>` (for example from `@nuxtjs/color-mode`) works too. Layout sizes are tokens as well: `--docs-sidebar`,
`--docs-toc`, `--docs-max`, `--docs-header`.

## Inside an existing site

The layer can add docs to a site that has its own design, pages and layout, for example a company site with docs
under `/docs` or `/handbook`:

```ts
// nuxt.config.ts of the existing site
export default defineNuxtConfig({ extends: ['@lupinum/ginko-docs'], modules: ['@lupinum/ginko/nuxt'], ginko })
```

```ts
// ginko.config.ts: the docs brick next to the site's own bricks, the Markdown components next to the site's own
import { components, docsCollection } from '@lupinum/ginko-docs/config'

bricks: { docs: docsCollection({ locales, base: '/handbook' }), /* … */ },
components: { ...components, /* the site's own components; same name wins */ },
```

- **Only the docs pages are added.** The layer registers its pages from the bricks, after all pages of the site are
  known: the docs at the `base` of `docsCollection` (default `/docs`), the blog (with its RSS feed) at the route of
  the `posts` brick and the changelog at the route of the `changelog` brick (or `pages.changelog`), and `/` only when
  the site has no start page of its own. A page the site defines itself at one of these addresses always wins, also
  when the page-paths module gives it that address (a page file `news.vue` that answers at `/blog`). Then the layer
  adds no page and no feed there, and its header and post links point to the site's page.
- **The site's frame stays.** The header, footer and page background are the layer's `layouts/default.vue`. When
  the site has its own `layouts/default.vue`, that one is used and the docs (navigation, page, table of contents)
  sit inside it, without the layer's framed panel, on the site's background. The search sits above the navigation.
  On phones a bar under the site's header holds a "Contents" button (the navigation as a sheet), the search and the
  "On this page" menu, so the docs need no header of their own.
- **Nothing leaks.** Every rule is under a `docs-` class; the page background, font and `color-scheme` are only set
  by the layer's own frame. The search, the language menu and the light/dark switch are components
  (`<DocsSearch />`, `<DocsLanguage />`, `<DocsThemeToggle />`) the site can put into its own header; the switch sets
  `data-theme` on `<html>`, so it fits a site that themes with that attribute. `<DocsThemeToggle segmented />` is the
  three-way Auto/Light/Dark switch and `<DocsLanguage list />` the languages as a row of links (the phone menu uses
  both). A language without a version of the page says so ("Not translated: opens the start page"). These three,
  `<DocsShell>` and the override points under [Customize](#customize) are the public components. The other `Docs*`
  components, the `useDocs*` composables and the files in `app/lib` are internal and can change in any release.
- **Error page:** the layer's `error.vue` shows a not-found page inside the site's layout, with links home and to
  the docs. A site with its own `error.vue` keeps it.
- **Components:** the layer loads the Vue side of `@lupinum/ginko-components`. Pass the registry in the site's
  `components` (see above): only then does Ginko check the tags and props in the pages. Without a registry, the
  check accepts any tag, so a misspelled `::calout` goes through without an error.
- **Title:** pages get the title `Page · Site name` from Ginko (`seo.titleTemplate` in `defineSite`). A
  `titleTemplate` in `app.head` or from nuxt-seo-utils does not apply to them, so the name is never added twice.
- **Styling:** map the site's design tokens to the token names above (leave out the ones the site already defines
  under the same name, often `--font-sans` and `--font-mono`). Three layout tokens line the docs up with the site:
  - `--docs-max` and `--docs-gutter`: the width and the side padding of the site's content container, so the search
    and the navigation start where the header's logo does.
  - `--docs-top`: the space the sidebar, the phone bar and the table of contents keep from the top of the window when
    they stick, and the scroll offset of headings. With a sticky header, its height; with one that scrolls away, 0.

```css
:root {
  --background: var(--color-white);
  --foreground: var(--color-ink);
  --muted: var(--color-stone-100);
  --muted-foreground: var(--color-stone-600);
  --border: var(--color-stone-300);
  --primary: var(--color-brand);
  --radius: 0.75rem;
  --docs-max: 82.5rem;
  --docs-gutter: 1.5rem;
  --docs-top: 4.5rem; /* sticky header 4.5rem high; 0 for one that scrolls away */
}
```

Headings use the site's own heading styles; the layer sets no font on them.

## Customize

Everything here is public and stays stable between releases.

**Tokens.** The colour tokens are listed under [Look and colours](#look-and-colours). The layout tokens:

| Token | Default | What it sets |
| --- | --- | --- |
| `--docs-max` | `90rem` | Width of the docs, gutters included |
| `--docs-gutter` | `1rem` | Space between the window edge and the docs |
| `--docs-top` | `0px` (standalone: the header) | Height of what sticks above the docs |
| `--docs-sidebar` | `17rem` | Width of the navigation |
| `--docs-toc` | `13.5rem` | Width of "On this page" beside the text (from 80rem window width) |
| `--docs-measure` | `38rem` | Reading width of running text |
| `--docs-h1` | `clamp(1.75rem, …, 2.25rem)` | Size of page titles |
| `--docs-header` | `4rem` | Height of the standalone header |

**Override points.** The layer ships empty components that a site replaces with its own file of the same name in
`app/components/`:

- `DocsPageEnd` (prop `doc`, the page's entry): after the text of every page, before "Edit this page" and the pager.
  For a support box or a call to action.
- `DocsSidebarEnd`: below the navigation, in the sidebar and in the phone menu. For a few links or a contact line.

**Own pages in the docs frame.** `<DocsShell>` is the docs body (navigation, search, the phone bar) with a default slot
for the page and a `bar` slot for controls in the phone bar. A help center's start page, for example:

```vue
<!-- app/pages/help/index.vue; the docs live at /help (docsCollection({ locales, base: '/help' })) -->
<script setup lang="ts">
const docs = useGinko('docs')
</script>

<template>
  <DocsShell>
    <h1>How can we help?</h1>
    <ul>
      <li v-for="item in docs.items" :key="item.id"><NuxtLink :to="item.url">{{ item.data.title }}</NuxtLink></li>
    </ul>
  </DocsShell>
</template>
```

The layer then adds no page of its own at that address.

**Search.** `docs: { search: false }` in app.config leaves out the built-in search (header, sidebar and phone bar), for
a site that puts `<DocsSearch />` into its own header.

**Texts.** Every text of the layer is a `docs.*` message, and the site's own i18n wins per key. A help center, for
example, words the search for itself in `i18n/en.json`: `{ "docs": { "searchPlaceholder": "Search help…" } }`. The
layer brings English, German and French.

## Blog and changelog (optional)

A site opts in by adding the collections to `ginko.config.ts`. The layer then adds the pages and the header links;
a site without them gets neither.

```ts
import { blogCollections, blogPages, changelogCollection, changelogPages, docsCollection } from '@lupinum/ginko-docs/config'

export default defineSite({
  // ...
  pages: { /* home */ blog: blogPages({ locales }), changelog: changelogPages({ locales }) },
  bricks: { docs: docsCollection({ locales }), ...blogCollections({ locales }), changelog: changelogCollection() },
})
```

- `blogCollections({ locales })` returns `{ posts, authors }`. Both are file bricks, so the folders are `content/posts/` and `content/authors/` (the brick name is the folder name).
- **Posts** (`content/posts/<n>.<name>[.<locale>].md`) have `title`, `description`, `date` (`YYYY-MM-DD`), `authors` (a list of author ids), `image`, `tags` and `slug`. They live at `/blog/<slug>` (`/<l>/blog/<slug>` in other languages), the list at `/blog`, newest first.
- **Authors** (`content/authors/<name>[.<locale>].yml`) have `name`, `role`, `avatar` and `url`. A post names them by id: `authors: [authors/jane]`. Authors have no page.
- A post page writes Article JSON-LD with the author names, `datePublished` from `date` and `dateModified` from the entry's `updatedAt`.
- **RSS:** `/blog/rss.xml` and `/<l>/blog/rss.xml`, RSS 2.0 with title and description (not the full text) and absolute links. It reads the build-time file bundle, so it works for file blogs only. `nuxt generate` writes it: the blog page sends the feed path in the `x-nitro-prerender` header, because Nitro's crawler does not follow `.xml` links.
- **Addresses:** the blog list is the parent of the `posts` route (`/blog/[slug]` gives `/blog`; `blogCollections` uses `/blog`). The changelog page is at the route of the `changelog` brick, else at `pages.changelog` (`changelogPages({ locales })`, `/changelog`). A changelog brick with neither gets no page, and the build warns once. A site that has its own page at an address keeps it; the layer then adds nothing there.
- **Changelog:** `changelogCollection()` (options: `max`) is one collection with `version`, `date` and Markdown text per release (`content/changelog/v1-2-0.md`; no dots in the file name, a dot reads as a language). The page `/changelog` shows all releases newest first, each with an anchor (`#v1-2-0`). It is a collection, not a docs page, so the date orders it and it has its own link in the header.

The Ginko docs themselves are built this way: [sites/docs](https://github.com/lupinum-dev/ginko/tree/main/sites/docs).

## License

MIT © Lupinum OG
