<h1 align="center">Ginko i18n</h1>
<p align="center">Nuxt i18n with the URL as the only locale source: translated slugs, SEO head tags, typed keys and an agent CLI, in a 2 KB runtime.</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@lupinum/ginko-i18n"><img alt="npm" src="https://img.shields.io/npm/v/@lupinum/ginko-i18n"></a>
  <a href="https://github.com/lupinum-dev/ginko/blob/main/LICENSE"><img alt="MIT license" src="https://img.shields.io/badge/license-MIT-blue.svg"></a>
  <a href="https://discord.lupinum.com"><img alt="Discord" src="https://img.shields.io/badge/Discord-join%20the%20chat-5865F2?logo=discord&logoColor=white"></a>
</p>

## Why use Ginko i18n?

- **The locale lives in the URL, nowhere else.** No cookie, header or browser check changes the page
  language, so server HTML, hydration and caches always agree. Browser language only drives a
  suggestion after the page has loaded.
- **Translated slugs.** `/ueber-uns` and `/en/about` are the same page. Dynamic pages (CMS, content)
  declare their per-locale paths before render.
- **SEO out of the box:** `lang`, `dir`, canonical, hreflang with x-default, and `og:locale` on every
  page. `@nuxtjs/sitemap` gets explicit alternates.
- **ICU messages, compiled at build time.** Plural, select, ordinal, numbers, dates and tags such as
  `<link>…</link>`. The message runtime is about 2 KB gzipped.
- **Typed keys and parameters.** A missing key or parameter fails typecheck.
- **One translator everywhere:** components, server routes (`getI18n(event)`), and plain TypeScript
  (`@lupinum/ginko-i18n/core`).
- **Built for agents.** `ginko-i18n check | todo | apply --json` finds and fixes missing, stale and
  broken translations.

Two URL strategies: `prefix_except_default` (`/about`, `/en/about`) and `prefix` (`/de/about`,
`/en/about`). There are no domain or cookie-only strategies, on purpose.

## Requirements

- Nuxt 4.6 or later.
- Nuxt 5 is experimental: it is tested only against one pinned Nuxt 5 nightly, so a newer nightly
  can break it.
- Node.js 22.14 or later, Node.js 24, or Node.js 26.
- Not together with `@nuxtjs/i18n`: setup fails with a message if both are installed.

## Installation

```bash
pnpm add @lupinum/ginko-i18n
```

## Quick start

**1. Add the module** to `nuxt.config.ts`:

```ts
export default defineNuxtConfig({
  modules: ['@lupinum/ginko-i18n'],
  i18n: {
    locales: ['de-AT', 'en-GB'], // URL codes become `de` and `en`
    defaultLocale: 'de-AT', // `/ueber-uns` and `/en/about`
    baseUrl: 'https://example.com', // absolute canonical and hreflang URLs
  },
})
```

**2. Add one message file per locale** in `i18n/`, next to `nuxt.config.ts`:

```json
// i18n/de.json
{
  "nav": { "about": "Über uns" },
  "cart": { "items": "{count, plural, =0 {Keine Artikel} one {# Artikel} other {# Artikel}}" },
  "legal": { "consent": "Ich akzeptiere die <link>Datenschutzerklärung</link>." }
}
```

```json
// i18n/en.json
{
  "nav": { "about": "About us" },
  "cart": { "items": "{count, plural, =0 {No items} one {# item} other {# items}}" },
  "legal": { "consent": "I accept the <link>privacy policy</link>." }
}
```

**3. Translate in pages and components.** `useI18n` and `<T>` are auto-imported:

```vue
<!-- app/pages/about.vue -->
<script setup lang="ts">
definePageMeta({ i18n: { paths: { de: '/ueber-uns' } } }) // `en` keeps /en/about
const { t, localePath } = useI18n()
</script>

<template>
  <main>
    <h1>{{ t('nav.about') }}</h1>
    <p>{{ t('cart.items', { count: 3 }) }}</p>
    <T k="legal.consent">
      <template #link="{ text }">
        <NuxtLink :to="localePath('/privacy')">{{ text }}</NuxtLink>
      </template>
    </T>
  </main>
</template>
```

**4. Add a language switcher.** Each alternate is the current page in another locale:

```vue
<!-- app/components/LanguageSwitcher.vue -->
<script setup lang="ts">
const { alternates } = useI18n()
</script>

<template>
  <nav>
    <NuxtLink
      v-for="a in alternates"
      :key="a.code"
      :to="a.path"
      :hreflang="a.language"
      :aria-current="a.current ? 'page' : undefined"
    >
      {{ a.name }}<span v-if="!a.translated"> (home)</span>
    </NuxtLink>
  </nav>
</template>
```

**5. Render both** in `app/app.vue`:

```vue
<template>
  <LanguageSwitcher />
  <NuxtPage />
</template>
```

That is the whole setup. Head tags and the switcher's paths follow from it, and so does the sitemap
if you add `@nuxtjs/sitemap`.

## Guides

### Dynamic pages (CMS, content)

A page with a slug declares its per-locale paths before render, so the switcher, hreflang and the
server HTML agree. The function runs on the server and on client navigation:

```ts
// pages/blog/[slug].vue
definePageMeta({
  alternates: async (to, { locale, localePath }) => {
    const post = await $fetch('/api/post', { query: { slug: to.params.slug, locale } })
    return Object.fromEntries(Object.entries(post.slugs).map(([code, slug]) => [code, localePath(`/blog/${slug}`, code)]))
  },
})
```

Return `undefined` to fall back to the page's own routes. A locale missing from the result shows as not
translated. Link to content with the paths your content data provides, never with
`localePath('/blog/…')`: `localePath` translates app routes, not content slugs.

### Locale options per page

- `definePageMeta({ i18n: { paths: { de: '/ueber-uns' } } })`: translated paths.
- `definePageMeta({ i18n: { locales: ['de'] } })`: the page exists only in German.
- `definePageMeta({ i18n: false })`: one unlocalized page (for example `/studio`).

### Server routes

`getI18n(event)` translates with the request's locale: the URL locale for pages, and the cookie, then
`Accept-Language`, for unprefixed paths such as `/api/**` and for user-locale zones.

```ts
// server/api/contact.post.ts
import { defineEventHandler } from 'nuxt/server'

export default defineEventHandler((event) => {
  const { t, locale } = getI18n(event)
  return { locale, message: t('contact.sent') }
})
```

Do not cache responses whose language comes from a header or cookie (`/api/**`, excluded paths, `/`
with `prefix`). Vercel ISR and Nitro SWR ignore `Vary`, so every visitor would get the first
visitor's language. The build warns when a route rule does this.

### Server components

Nuxt does not pass the page URL to server components, so they cannot see the locale. Pass it:
`<MyCard.server :locale="locale" />` with `locale` from `useI18n()`. Dev mode warns when an island
has no locale.

### Browser language

The locale never changes on its own. `useLocaleSuggestion()` returns the visitor's preferred locale
when this page exists in it (`null` on the server and before mount), so you can offer a link:

```vue
<script setup lang="ts">
const suggestion = useLocaleSuggestion()
</script>

<template>
  <p v-if="suggestion"><NuxtLink :to="suggestion.path">View in {{ suggestion.name }}</NuxtLink></p>
</template>
```

With `strategy: 'prefix'`, `/` has no content: it redirects by cookie, then browser language, with
`Vary`. Static hosts get a small inline redirect script.

### Apps and SaaS

Behind a login, the URL should not carry the language: the user's setting decides. A *user-locale
zone* is a set of paths whose locale comes from the user (cookie, then `Accept-Language`, then the
default locale), not from the URL:

```ts
export default defineNuxtConfig({
  i18n: {
    locales: ['de-AT', 'en-GB'],
    userLocale: ['/app/**'], // a whole app: ['/**']
  },
})
```

Zone pages have no prefix, no locale clones, no sitemap entry, and no canonical, hreflang or
`og:locale` (there is no other URL). The head gets `lang` and `dir` only. `alternates` is `[]`.
Marketing pages outside the zone stay URL-localized.

The server reads the `ginko_locale` cookie, then `Accept-Language`. It sets the locale once per
request; the client takes it from the payload and never detects it in the browser, so there is no
hydration mismatch. Set the cookie from the user's account setting when they sign in
(`ginko_locale=en; Path=/; Max-Age=31536000; SameSite=Lax`), so the first render already has the
right language.

`switchLocale(code)` changes the language:

```vue
<script setup lang="ts">
const { t, locale, locales, switchLocale } = useI18n()
</script>

<template>
  <button v-for="l in locales" :key="l.code" :disabled="l.code === locale" @click="switchLocale(l.code)">
    {{ l.name }}
  </button>
</template>
```

In a zone it writes the cookie, loads the messages and re-renders in place (same URL, no reload).
On a URL-localized page it navigates to the same page in `code`, or to that locale's home when the
page is not translated. An unknown code throws.

- Do not cache zone pages (`isr`, `swr`, `cache` route rules): the language comes from a cookie or
  header. The build warns, like for `/api/**`. The module also keeps zones out of the prerenderer, so
  a static copy never shows the default language to everyone. Zones need a server.
- `exclude` means "not localized": the page renders in the default locale. `userLocale` means
  "localized by the user": the page renders in the user's locale. Excluded paths (`/api/**`,
  Nuxt internals, `exclude`) are never in a zone, so `userLocale: ['/**']` leaves them alone.
- Entering a zone from a URL page keeps the language of the first page load. Switching on a URL page
  never changes the zone's language; only `switchLocale` inside the zone and the cookie do.

### Libraries with their own messages

A Nuxt module ships namespaced messages through a hook. The host app can override any key per
locale in its own `i18n/` files:

```ts
nuxt.hook('ginko-i18n:sources', (sources) => {
  sources.push({ namespace: 'cms', dir: resolve('./runtime/i18n') })
})
```

`useI18n('cms')` then gives a translator whose keys are relative to that namespace.

### Outside Nuxt

`@lupinum/ginko-i18n/core` has the framework-free parts: locale paths (`localizePath`, `stripLocale`,
`localeFromPath`), `negotiateLocale` for `Accept-Language`, `createFormatters` (`format.relative` gives `5 minutes ago`; pass `now` for server/client-equal output), and
`createTranslator`, which takes messages compiled at build time.

## Options

| Option | Default | Meaning |
| --- | --- | --- |
| `locales` | (required) | BCP 47 tags such as `'de-AT'`, or `{ language, code?, name? }`. The URL code defaults to the language subtag (`de-AT` → `de`); the name to the native name from `Intl.DisplayNames`. |
| `defaultLocale` | first locale | The locale with no prefix under `prefix_except_default`, and the fallback for missing messages. |
| `strategy` | `'prefix_except_default'` | Or `'prefix'`: every locale has a prefix and `/` redirects. |
| `seo` | `true` | Head tags: `lang`, `dir`, canonical, hreflang with x-default, `og:locale`. |
| `baseUrl` | none | Absolute site URL for canonical and hreflang. Set it in production. |
| `params` | `{}` | Parameters every message can use, for example `{ tone: 'sie' }` for `{tone, select, …}`. |
| `exclude` | `[]` | Extra unprefixed paths. `/api/**` and Nuxt internals are always excluded. |
| `userLocale` | `[]` | Paths whose locale comes from the user (cookie, then `Accept-Language`), not the URL, for apps behind a login: `['/app/**']`. Same syntax as `exclude`. See [Apps and SaaS](#apps-and-saas). |
| `timeZone` | `'UTC'` | IANA time zone of the site (`'Europe/Vienna'`) for timestamps in `format.date` and `{d, date}` / `{d, time}` in messages. Calendar dates (`2026-10-08`) always stay on their day. One call can use another zone: `t('key', params, { timeZone: site.timezone })`, e.g. in an app that shows times of a site somewhere else. |

A missing translation shows the default locale's text. The build and dev server list the missing
keys per locale, and `ginko-i18n check` fails CI on them.

## CLI

The CLI reads Nuxt's generated `ginko-i18n/manifest.json` and the original message
files. It needs no browser.

```sh
npx ginko-i18n check --json
npx ginko-i18n todo --to en --json
npx ginko-i18n apply translations.json --json
```

Global options are `--cwd <app>` (defaults to the current directory),
`--build-dir <dir>` (defaults to `<app>/.nuxt`), `--json`, and `--help`.

To check a plain catalog folder with one `<code>.json` file per locale, with no
Nuxt app, add `--dir <folder> --default <code>`. Relative paths resolve from
`--cwd`. `--default` must name a locale file in the folder, and both options go
together. `i18n.lock.json` and `glossary.json` are then read and written in that
folder. Without source directories, `check` skips the unused-key check and sets
`summary.unusedSkipped` to `true`:

```sh
npx ginko-i18n todo --dir i18n --default de --to es --json
```
Relative build, input, and site paths resolve from the app directory. If the
manifest is absent, the CLI runs the app's local `nuxt prepare` once. Preparation
writes Nuxt build files; with an existing manifest, `check` only reads files.
Preparation logs and apply warnings go to stderr. With `--json`, stdout contains
one JSON value, including for usage and configuration errors.

`check` reports missing and extra translations, invalid ICU, parameter differences,
incomplete plural categories, stale translations, unknown static keys, and unused
app/layer keys. Parameters declared in the manifest are optional on either side.
Static usages include `t('key')`, literal backticks, `<T k="key">`, and simple
`const x = useI18n('namespace')` followed by `x.t('key')`. Any dynamic translation
call suppresses unused warnings and sets `summary.unusedSkipped` to `true`.
The scanner is a conservative text scan, not a JavaScript parser; comments and
strings containing call-shaped text can count as usages.

Use `check --locale <code>` to see only one locale's findings, for example while
translating it.

Use `check --site <built-html-directory>` to validate canonical URLs, self and
reciprocal hreflang links, x-default, and HTML language. Error documents and
noindex pages are ignored. URL paths identify local HTML files regardless of origin.

`todo --to <code>` lists missing and stale translations with their original ICU
source, current translation when present, parameters, and static usage locations.
Use `--only missing` or `--only stale` to narrow the list. Each item names its
`target`: the file `apply` will write. Keys from a layer go to that layer's folder,
which other sites may share; library keys go to the app.

The JSON output also includes:

- `params`: global parameters every message can use, from `i18n.params` in
  `nuxt.config` (for example `tone: 'sie'` for German Du/Sie). Messages may branch on
  them with `select`; translations do not have to use them.
- `glossary`: the app's `i18n/glossary.json`, or `null` if absent. Use it for brand
  terms, words that must stay untranslated, and tone per locale. Its shape is free.

`apply <file>` accepts JSON in this form; `apply -` reads stdin:

```json
{
  "locale": "en",
  "items": [{ "key": "greeting", "text": "Hello {name}" }]
}
```

Each item must compile and use the source parameters, except global parameters.
Missing plural categories produce a warning in the result's `warnings` (with sample
numbers, such as `many (e.g. 1000000)` for Italian) but do not reject a translation.
Valid items are saved even if other items are rejected. Layer/app keys go to the
source directory that defines the default message. Library keys go to the app's
`i18n/<locale>.json`, including their namespace. Keys follow default-source order;
unrelated keys remain, with two-space indentation and a trailing newline.
The app's `i18n/i18n.lock.json` records the SHA-256 hash of each translated source.
A changed hash produces a stale warning on subsequent checks. Do not edit source
files concurrently with apply; apply reads and rewrites each affected JSON file.

Exit codes: `0` means no errors, `1` means check errors or rejected apply items,
and `2` means invalid usage or configuration. Warnings alone return `0`.

## Contributing

Ginko i18n lives in the [Ginko monorepo](https://github.com/lupinum-dev/ginko) under `packages/ginko-i18n`. Run `pnpm test` and `pnpm typecheck` there before you open a pull request. The design decisions and their evidence are in [DECISIONS.md](https://github.com/lupinum-dev/ginko/blob/main/packages/ginko-i18n/DECISIONS.md); change one only with new evidence.

## Support and security

Ask questions in the [Lupinum OSS Discord](https://discord.lupinum.com). Report vulnerabilities privately through [GitHub private vulnerability reporting](https://github.com/lupinum-dev/ginko/security/advisories/new).

## License

[MIT](https://github.com/lupinum-dev/ginko/blob/main/LICENSE) © Lupinum OG.
