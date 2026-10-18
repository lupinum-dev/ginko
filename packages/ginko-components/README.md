# @lupinum/ginko-components

Editorial Markdown components for Ginko: the registry (what an editor may write) and the Vue components (how it looks).

```bash
npm install @lupinum/ginko @lupinum/ginko-i18n @lupinum/ginko-components
```

`@lupinum/ginko` and `@lupinum/ginko-i18n` are peer dependencies: your site installs them once, and the components use that copy.

```ts
// nuxt.config.ts
export default defineNuxtConfig({ modules: ['@lupinum/ginko/nuxt', '@lupinum/ginko-components'] })
```

```ts
// ginko.config.ts: pure data, no Vue, loads in Node
import { components } from '@lupinum/ginko-components/registry'
export default defineSite({ /* … */ components })
```

The module needs `@lupinum/ginko/nuxt` (it installs ginko-i18n, which provides the UI texts); without it the build
stops with a message that says so. The module gives `<GinkoMarkdown>` the tag → component map (through an internal
inject key); `<GinkoMarkdown>` merges it under its own `components` prop, so a site overrides one tag by passing it there. The plugin gives `<GinkoMarkdown>` a lazy map: a page loads only the components its Markdown uses. Import single components for an override; never spread `componentMap` into `components`, because that loads every component on every page.

## Exports

| Entry | What |
|---|---|
| `@lupinum/ginko-components` | The Nuxt module (config key `ginkoComponents`) |
| `@lupinum/ginko-components/registry` | `components`, the registry: tags, props and editor examples, plain data |
| `@lupinum/ginko-components/components` | Every Vue component (`Callout`, `Card`, `Tabs`, ...) and `componentMap` (tag → component; the six callout short forms are only there, for example `componentMap.note`) |
| `@lupinum/ginko-components/styles.css` | All stylesheets in order, for hosts without the module |

All of `./components` is public on purpose: a site wraps or replaces one component and passes the result through the
`components` prop of `<GinkoMarkdown>`. What stays stable is the component names and the props of the registry (the
Markdown props in the tables below). Slots, other props and the inner markup may change in any release.

## Props

Prop names are camelCase (`iconColor`, `defaultValue`), and Markdown takes them exactly as written:
`::card{iconColor="primary"}`. `icon-color` is an error ("property does not exist"). Boolean props work bare
(`::code-tree{expandAll}`) or with `"true"`/`"false"`.

One word per idea on every tag: the heading is `title`, the status colour for a problem is `error`, the border kind of
`layout`, `center` and `figure` is `frame`, the fill of `flow` and `layout` is `background`, the look of a component box
is `appearance`, how an image fills its box is `fit`, and the width preset of `flow`, `column` and `center` is `width`
(`figure{width,height}` are pixel sizes, like the attributes of `<img>`). No value is called `default`: the value without a frame or
fill is `none`.

## Theming

Styles are plain CSS. The module adds them; outside Nuxt (for example an editor),
`import '@lupinum/ginko-components/styles.css'` loads them in order.

**Colours** come from shadcn-style tokens the site already has: `--background`, `--foreground`, `--card`, `--muted`,
`--muted-foreground`, `--border`, `--primary`, `--primary-foreground`, `--ring`, `--radius` and `--font-mono`. Each
colour token must be a full colour (`oklch(...)`, `hsl(...)`, hex). Older shadcn themes (Tailwind 3) store bare HSL
channels (`--muted: 210 40% 96%`); those give no colour here. A site without the tokens gets neutral defaults that
follow its colour mode: dark where it sets `color-scheme: dark`, `.dark` or `data-theme="dark"`, light everywhere else,
also on a dark system. For this the stylesheet sets `color-scheme: dark` on `.dark` and `[data-theme="dark"]`, which
also darkens the site's own form controls and scrollbars inside them. The defaults need `light-dark()` (Safari 17.5,
Chrome 123).

**Appearance.** Every framed component is *quiet* (a border) or *tint* (a filled area). Callouts and excerpts are
tint by default, the rest quiet. `appearance="quiet"` or `appearance="tint"` on a tag changes one instance; it renders
as `data-appearance` on the component's root. Cards in a `cards{appearance}` follow it. The tags with `appearance`:
`callout` and its short forms, `aside`, `excerpt`, `accordion`, `collapse`, `tabs`, `cards`, `card`, `read-more`,
`inline-toc`, `steps`, `files`, `api`, `quiz`. A site changes the default of every framed component on `:root`:

```css
:root { --ginko-surface: var(--muted); --ginko-surface-border: transparent; } /* everything tint */
```

**Code** sits on a dark panel in both colour modes, inside a lighter frame that holds the file name or the tabs. The
syntax colours are the dark Shiki theme (`--shiki-dark`, which ginko-content always writes); with a single Shiki
theme the code keeps that theme's colours.

**Stable** (until 1.0, changes only in a minor release, with a changelog entry):

| Kind | Names |
|---|---|
| Tokens a site sets | `--ginko-surface`, `--ginko-surface-border` (default of every framed component), `--ginko-tint` (fill of tint, default `--muted`), `--ginko-info`, `--ginko-warning`, `--ginko-error`, `--ginko-success`, `--ginko-idea` (status colours), `--ginko-code-frame`, `--ginko-code-bg`, `--ginko-code-fg`, `--ginko-code-muted`, `--ginko-code-hover` (code panel), `--ginko-scroll-margin` (space above an API entry that a link scrolls to, default `5rem`) |
| Root classes | `ginko-<tag>` on the root element of each tag, for example `ginko-callout` (also for the short forms), `ginko-card`, `ginko-api-param`. Exceptions: the code block (`pre`) is `ginko-code`, Markdown images are `ginko-img`, `collapse` without `title` is `ginko-clip` |
| Attributes | `data-appearance="quiet"` / `"tint"` on a root |

Everything else is internal and can change in any release: the `--ginko-default-*` fallbacks, other `--ginko-*`
custom properties, class names below the root (`ginko-card-title`, ...) and other `data-*` attributes.

## Tags

| Tag | Kind | Props |
|---|---|---|
| `callout` | block | `type` note, info (default), warning, error, success, idea; `title`; `icon` (a built-in name: file-text, info, triangle-alert, circle-x, circle-check, lightbulb; or an Iconify name with a colon, `lucide:flag`) |
| `note` `info` `warning` `error` `success` `idea` | block | `title`; `icon` (as on `callout`; a `callout` with fixed type) |
| `aside` | block | `title` |
| `excerpt` | block | `title`; `source`; `size` body (default), display |
| `dropcap` | block | `lines` 2 to 4 |
| `kbd` | inline | none |
| `badge` | inline | `color` neutral (default), primary, success, warning, error |
| `flow` | block | `width` reading (default), wide; `background` none (default), muted, tint |
| `layout` | block, children `column` | `frame` none (default), card, border, border-dashed, outline, outline-dashed; `align`; `gap`; `stack`; `background` as on `flow` |
| `column` | block, parent `layout` | `width` xs to xl; `align`; `fit` natural, cover, contain |
| `center` | block | `width` sm, md, lg; `frame` as on `layout` |
| `timeline` | block, children `timeline-item` | none |
| `timeline-item` | block, parent `timeline` | `date`; `meta` (a short word next to the date); `title`; `icon`* (instead of the dot); `active` |
| `pre` (plain Markdown tag, renderer override) | block | the code block of Markdown: label from `filename` or language, copy button |
| `code-group` | block | none; children are code blocks, shown as tabs named by filename or language |
| `code-tree` | block | `file` (path of the open file); `expandAll`; children are code blocks whose filename is the path |
| `files` | block | `active` (path to mark); content is a Markdown list, a nested list is a folder, text after ` # ` is a note at the end of the row; known file types get their icon |

`icon` takes one of the built-in symbols: `file-text`, `info`, `triangle-alert`, `circle-x`, `circle-check`, `lightbulb`.

Interactive components (`registry-interactive.ts`, styles in `interactive.css`):

| Tag | Kind | Props |
|---|---|---|
| `tabs` | block, children `tab` | `variant` separate (default: buttons above a frame), line (underlined, no frame); `padded` (default on; off lets a code block fill the tab); WAI-ARIA tabs, the first tab is selected on the server, hidden panels stay in the page |
| `tab` | block, parent `tabs` | `title` (required); `icon`* |
| `accordion` | block, children `accordion-item` | `multiple` (otherwise opening one item closes the others, through the shared `name` of `<details>`) |
| `accordion-item` | block, parent `accordion` | `title` (required); `open` (`<details>`, works without JavaScript) |
| `collapse` | block | with `title`: a `<details>` section, `open` sets the initial state; without `title`: long content (usually code) is cut off behind a fade with a "Show all n lines" button |
| `steps` | block | `mode` numbered (default), check; every heading directly inside starts a step |
| `cards` | block, children `card` | `cols` 1 to 3 (default 2) |
| `card` | block | `title`; `description`; `footer`; `href`; `icon`* (in a tile above the title); `iconColor` primary, info, success, warning, error; `image`; `horizontal` |
| `read-more` | block | `href` (required); `title` (the link text; the address if empty); `icon`*; several in a row join into one list |
| `inline-toc` | block | `title`; `depth` 2 to 4; `open` (closed by default); reads the toc of the page that `<GinkoMarkdown>` renders, and renders nothing without headings |

\* An Iconify name such as `lucide:book-open` (a bare name means Lucide). It renders through the site's global `<Icon>`:
`@nuxt/icon`, or the `@lupinum/ginko-docs` layer, which provides one. A site without either shows no icon. A site that
installs `@nuxt/icon` itself works as long as it keeps the default component name (`icon.componentName: 'Icon'`).
Only the icon sets the site installs work.

Media components (`registry-media.ts`, styles in `media.css`):

| Tag | Kind | Props |
|---|---|---|
| `img` (plain Markdown tag, renderer override) | inline | `loading="lazy"`, `decoding="async"`, `width`/`height` when the tree has them (ginko-content adds them) |
| `figure` | block | `src` (image, required); `alt` (required); `caption`; `width`; `height`; `bleed`; `aspect` auto, video, wide, square, portrait; `fit` cover, contain; `placement` inline, start, end; `frame` border (default), none; `focus` center, top, bottom, left, right; `zoom` (default on: a click opens a native `<dialog>`, Escape or the close button closes it) |
| `video` | block | `src` (required: YouTube or Vimeo link, or a `.mp4`/`.webm` URL); `title` (required); `poster` (image); `start` (seconds) |
| `embed` | block | `src` (required: the address of an allowed provider); `title` (required: iframe title and button label); `poster` (image) |

`video` loads nothing from YouTube or Vimeo until the visitor clicks play: no iframe, no thumbnail. Then it inserts
`youtube-nocookie.com` or `player.vimeo.com` (`dnt=1`). A direct file is a native `<video preload="none">`; any other
host is a plain link. There is no generic iframe on purpose; see `embed` below.

## Install a component with the shadcn-vue CLI

The npm module above is the simple path: one line in `nuxt.config.ts`, updates through the package. To own and change
the code of a component, copy it into your app with the [shadcn-vue](https://www.shadcn-vue.com) CLI instead. The
Ginko docs site serves the registry:

```sh
npx shadcn-vue@latest add https://ginko-docs.vercel.app/r/callout.json
```

Item names are the kebab-case file names (`callout`, `code-block`, `timeline-item`);
[`/r/registry.json`](https://ginko-docs.vercel.app/r/registry.json) lists them all. The CLI writes the component and
its helper files to `components/ginko/` (under your `components` alias) and installs the npm packages it needs. Items
it depends on (the shared stylesheet `ginko-components`, the helpers `ginko-utils`, other components) come along.
Import the stylesheet once in your main CSS: `@import "./components/ginko/ginko-components.css";`. It reads your
shadcn tokens (see Theming). Without the Nuxt module there is no UI-text provider, so the components use the English
texts in `texts.ts`; edit them there. The tag-to-component map and the editor registry are not part of an item.

The items are generated from the files in `src/runtime/components` (never a second copy):
`pnpm --filter @lupinum/ginko-components registry` writes them to `sites/docs/public/r/` (git-ignored), and the docs
build runs it. Items reference each other by URL: `<url>/r`, with `url` from `sites/docs/ginko.config.ts`;
`GINKO_REGISTRY_URL` overrides it (for example `http://localhost:3500/r` to test against the docs dev server).

## Embeds (`embed`)

`embed` shows maps, music and booking widgets, but only from a list of known providers. Before the click it renders a
neutral surface (or your `poster`), a button "Load content: <title>" and one consent line; no iframe, no request to the
provider. After the click it inserts the iframe with `loading="lazy"`,
`referrerpolicy="strict-origin-when-cross-origin"` and `sandbox="allow-scripts allow-same-origin allow-popups allow-forms"`.
An address no provider matches is a plain link (`rel="noopener"`); `javascript:`, `data:` and other non-http(s)
addresses render only the title as text.

Built-in providers (id: accepted address):

| Id | Address | Notes |
|---|---|---|
| `google-maps` | `https://www.google.com/maps/embed?pb=...` | The `src` from Google Maps "Teilen → Karte einbetten" |
| `openstreetmap` | `https://www.openstreetmap.org/export/embed.html?...` | The `src` from "Teilen → HTML" on the export page |
| `spotify`, `spotify-list` | `open.spotify.com/{track,episode,album,playlist,show}/<id>` | Compact player (152 px) for track and episode, large (352 px) otherwise |
| `calendly` | `https://calendly.com/<user>[/<event>]` | Fixed height 700 px |

SoundCloud is not built in: its widget needs the page address percent-encoded in a query parameter, which a plain
replacement cannot do. Add it as a provider if you need it. Calendly's `embed_type=Inline` parameter is not added: only
Calendly's widget script needs it and its iframe guide does not list it.

A provider is plain data: `name` (consent line), `pattern` (regex source tested against the whole address, must start
with `^https://`), `embed` (replacement with `$1`.. groups, must start with `https://`), optional `ratio` (default
`16/9`), `height` (fixed px instead of a ratio) and `allow` (the iframe `allow` attribute). The first provider whose
pattern matches wins. Configure them in `nuxt.config.ts` under `ginkoComponents`; an object adds or replaces a provider
by id, `false` disables a built-in:

```ts
export default defineNuxtConfig({
  ginkoComponents: {
    embeds: {
      providers: {
        peertube: {
          name: 'PeerTube (Beispiel)',
          pattern: '^https://peertube\\.example\\.org/w/([\\w-]+)$',
          embed: 'https://peertube.example.org/videos/embed/$1',
          allow: 'fullscreen',
        },
        spotify: false,
      },
    },
  },
})
```

The module checks the providers at build time and fails with a German/English message naming the provider id (pattern
not starting with `^https://`, invalid regex, `embed` not starting with `https://`, empty name). The merged list reaches
the browser through `runtimeConfig.public.ginkoEmbeds` as data only. Only add providers you trust: each one lets editors
load that host in an iframe.

Learning and API components (`registry-learn.ts`, `registry-api.ts`, styles in `extra.css`):

| Tag | Kind | Props |
|---|---|---|
| `quiz` | block, children `quiz-question` | `title`; `description`; one question at a time, back/next, a result at the end; runs in the browser, nothing is sent |
| `quiz-question` | block, parent `quiz` | `question` (required); `mode` single (default), multiple; the content is a task list of answers (`- [x]` right, `- [ ]` wrong); the slot `#explanation` shows after "check" |
| `api` | block, children `api-param` | `title` (shown without method and path); `method` get, post, put, patch, delete, head, options; `path`; one tab per `group` |
| `api-param` | block, parent `api` | `name` (required); `group` (default "Parameter"); `type`; `required` (shows a badge); `deprecated`; `since`; `defaultValue`; the content is the description |

Answers are real radio buttons or checkboxes in a `<fieldset>` with a `<legend>`; the result is announced through an
`aria-live` region and the explanation and the right answers are only rendered after "check". Because the
`#explanation` slot is a Markdown slot, the site's `ginko.config.ts` must pass the registry as `components` (without it
the parser refuses slots).

## UI texts

Fixed texts (copy button, zoom, play) live in `i18n/de.json` and `i18n/en.json`. The module adds them to ginko-i18n under
the namespace `components`, so they follow the page language; a site overrides one key in its own `i18n/<code>.json`
(for example `{ "components": { "code": { "copy": "Kopieren" } } }`). Without Nuxt (SSR tests) the components use the German defaults.

`components` is a reserved namespace: do not use it for your own messages. The keys you can override are the ones in
[`i18n/en.json`](./i18n/en.json): `code.*` (copy button), `media.*` (zoom, play, consent), `embed.*`, `quiz.*`, `api.*`,
`collapse.*` and `toc.title`.
