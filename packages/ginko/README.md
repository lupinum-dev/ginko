# @lupinum/ginko

Connect a Nuxt site with its content. The site stays normal Nuxt code; the content arrives as one
JSON **bundle** per language, either from the hosted Ginko platform (owners edit opening hours, menus,
events) or from Markdown files in your repo (with [`@lupinum/ginko-content`](https://github.com/lupinum-dev/ginko/tree/main/packages/ginko-content)).

## Start

```bash
npm create ginko my-site
```

Or add it to an existing Nuxt 4.6+ site:

```bash
npm install @lupinum/ginko
```

```ts
// ginko.config.ts: the bricks (content types) of this site
import { collection, defineSite, f } from '@lupinum/ginko'

export default defineSite({
  site: 'my-site',
  name: 'My site',
  url: 'https://example.com',
  timezone: 'Europe/Vienna',
  locales: ['de', 'en'],
  currency: 'EUR',
  pages: { home: { de: '/', en: '/en' } },
  bricks: {
    events: collection({
      label: 'Events',
      fields: { title: f.text('Title'), date: f.date('Date') },
      max: 50,
      order: { field: 'date', dir: 'asc' },
    }),
  },
})
```

```ts
// nuxt.config.ts
import ginko from './ginko.config'

export default defineNuxtConfig({ modules: ['@lupinum/ginko/nuxt'], ginko })
```

```vue
<script setup lang="ts">
const events = useGinko('events') // typed from ginko.config.ts
</script>
```

## What is in the package

- **`@lupinum/ginko`**: `defineSite`, the field types, schema checks and the bundle format.
- **`@lupinum/ginko/nuxt`**: the Nuxt module. It fetches and caches the bundle, adds `useGinko`,
  `useGinkoEntry`, `useGinkoToday` and `<GinkoMarkdown>`, a sitemap, and languages through
  [`@lupinum/ginko-i18n`](https://github.com/lupinum-dev/ginko/tree/main/packages/ginko-i18n).
- **`@lupinum/ginko/vue`**: `<GinkoMarkdown :value>` (renders a parsed tree, inside `<Suspense>`) for a Vue 3 app without Nuxt.
- **`ginko`**: the CLI. `ginko check` checks the config and the content links of every site (use it in CI);
  `release` and `export` work with the hosted platform; `dev`, `pull` and `import` run only in the Ginko monorepo.

## Stability

`@lupinum/ginko`, `@lupinum/ginko/nuxt` and `@lupinum/ginko/vue` are the public API. Every name they
export is documented on the docs site. Until 1.0, a minor release may still break it, and the changelog
names the break. `@lupinum/ginko/internal` and `@lupinum/ginko/search` are for Ginko's own packages.
They can change in any release, so do not import them in a site.

## Docs

[Getting started](https://github.com/lupinum-dev/ginko/blob/main/sites/docs/content/docs/1.einstieg.en.md) ·
[Bricks](https://github.com/lupinum-dev/ginko/blob/main/sites/docs/content/docs/3.bausteine.en.md) ·
[Reading content](https://github.com/lupinum-dev/ginko/blob/main/sites/docs/content/docs/5.seiten-lesen.en.md) ·
[Languages](https://github.com/lupinum-dev/ginko/blob/main/sites/docs/content/docs/6.sprachen.en.md) ·
[Content from files](https://github.com/lupinum-dev/ginko/blob/main/sites/docs/content/docs/4.inhalte-aus-dateien.en.md) ·
[Platform and CLI](https://github.com/lupinum-dev/ginko/blob/main/sites/docs/content/docs/9.plattform-und-cli.en.md)

## License

MIT © Lupinum OG
