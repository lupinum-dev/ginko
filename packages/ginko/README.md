# @lupinum/ginko

Connect a Nuxt site with its content. The site stays normal Nuxt code; the content arrives as one
JSON **bundle** per language, either from the hosted Ginko platform (owners edit opening hours, menus,
events) or from Markdown files in your repo (with [`@lupinum/ginko-content`](https://github.com/lupinum-dev/ginko/tree/main/packages/ginko-content)).

## Start

```bash
npm create ginko my-site
```

Or add it to an existing Nuxt 4.6+ or Nuxt 5 site:

```bash
npm install @lupinum/ginko @lupinum/ginko-content
```

```ts
// ginko.config.ts: the bricks (content types) of this site
import { collection, defineSite, f } from '@lupinum/ginko'

export default defineSite({
  site: 'my-site',
  name: 'My site',
  url: 'https://example.com',
  timeZone: 'Europe/Vienna',
  locales: ['en'],
  currency: 'EUR',
  pages: { home: '/' },
  bricks: {
    events: collection({
      label: 'Events',
      source: 'files', // read from content/events/*.md; without `source` the brick needs the Ginko platform
      fields: { title: f.text('Title'), date: f.date('Date') },
      max: 50,
      order: { field: 'date', dir: 'asc' },
    }),
  },
})
```

One file per entry, for example `content/events/opening.md`:

```md
---
title: Opening night
date: 2026-11-05
---
```

```ts
// nuxt.config.ts
import ginko from './ginko.config.ts'

export default defineNuxtConfig({ modules: ['@lupinum/ginko/nuxt'], ginko })
```

```vue
<script setup lang="ts">
const events = useGinko('events') // typed from ginko.config.ts
</script>
```

## What is in the package

- **`@lupinum/ginko`**: `defineSite`, `single`, `collection`, `f`, `defineComponents`, `formatMoney`, `plainText`,
  `safeHref`, `startOfWeek` and the documented types.
- **`@lupinum/ginko/nuxt`**: the Nuxt module. It fetches and caches the bundle, adds the composables
  (`useGinko`, `useGinkoEntry`, `useGinkoQuery`, `useGinkoNeighbors`, `useGinkoNav`, `useGinkoBreadcrumbs`,
  `useGinkoToday`, `useGinkoWeek`, `useGinkoLocale`, `useGinkoPath`, `useGinkoSeo` and more), the components
  `<GinkoMarkdown>` and `<GinkoImage>`, a sitemap, and languages through
  [`@lupinum/ginko-i18n`](https://github.com/lupinum-dev/ginko/tree/main/packages/ginko-i18n).
- **`@lupinum/ginko/vue`**: `<GinkoMarkdown :value>` for a Vue 3 app without Nuxt: takes a parsed `MarkdownTree`,
  renders at once (no `<Suspense>`), and uses only the components you pass. Pass the site's `components` as
  `registry` too: a component keeps only the props its registry declares.
- **`ginko`**: the CLI. `ginko check` checks the config and the content links of every site (use it in CI;
  `--offline` needs no platform key); `release` and `export` work with the platform; `ginko connect
  <Studio address>` gets a publishing key for the website folder after you confirm its code in the Studio, and stores
  it as the GitHub secret `GINKO_KEY` (with `gh`) or shows it once. Every run prints one JSON line and ends with a
  documented exit code.

## Stability

`@lupinum/ginko`, `@lupinum/ginko/nuxt`, `@lupinum/ginko/vue`, `@lupinum/ginko/search` and `@lupinum/ginko/basics` are
the public API. Every name they export is documented on the docs site. `pos` and `retired` on fields and bricks are set by
the platform; do not set them. Until 1.0, a minor release may still break it, and the changelog names the break.
`@lupinum/ginko/internal` and `@lupinum/ginko/internal/search` are for Ginko's own packages. They can change in
any release, so do not import them in a site.

## Docs

[Quick start](https://ginko.lupinum.com/docs/getting-started) ·
[defineSite](https://ginko.lupinum.com/docs/define-site) ·
[single and collection](https://ginko.lupinum.com/docs/bricks) ·
[Composables and components](https://ginko.lupinum.com/docs/reading-content) ·
[Content files](https://ginko.lupinum.com/docs/content-from-files) ·
[Add a language](https://ginko.lupinum.com/docs/add-a-language) ·
[ginko CLI](https://ginko.lupinum.com/docs/cli) ·
[Upgrade Ginko](https://ginko.lupinum.com/docs/upgrade)

## License

MIT © Lupinum OG
