<h1 align="center">Ginko i18n</h1>
<p align="center">Nuxt i18n with the URL as the only locale source: translated slugs, SEO head tags, typed keys and an agent CLI, with a message runtime under 2 KB.</p>

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
  page. `@nuxtjs/sitemap` gets explicit alternates for static pages.
- **ICU messages, compiled at build time.** Plural, select, ordinal, numbers, dates and tags such as
  `<link>…</link>`. The parser never reaches the browser; the message runtime is under 2 KB gzipped.
- **Typed keys and parameters.** A missing key or parameter fails typecheck.
- **One translator everywhere:** components, server routes (`getI18n(event)`), and plain TypeScript
  (`@lupinum/ginko-i18n/core`), for example in Convex functions or emails.
- **Built for agents.** `ginko-i18n check | todo | apply --json` finds and fixes missing, stale and
  broken translations.

Two URL strategies: `prefix_except_default` (`/about`, `/en/about`) and `prefix` (`/de/about`,
`/en/about`). There are no domain or cookie-only strategies, on purpose.

### Compared with @nuxtjs/i18n

| | Ginko i18n | @nuxtjs/i18n 10.6 |
| --- | --- | --- |
| Locale source | The URL only. Browser language only drives a suggestion. | The URL, and by default `/` redirects by cookie and browser language (`detectBrowserLanguage`). |
| URL strategies | `prefix_except_default`, `prefix` | Also `no_prefix`, `prefix_and_default` and domains per locale. |
| Translated slugs | `definePageMeta({ i18n: { paths } })` | The same, or the `pages` option. |
| SEO head tags | On every page, automatically. | `useLocaleHead()`, which you call in your layout. |
| Message format | ICU, compiled at build time | vue-i18n syntax (`\|` plurals, `@:` linked messages) |
| Client JavaScript it adds¹ | 5.4 KB gzipped | 29.3 KB gzipped |
| Translation CLI | `ginko-i18n check \| todo \| apply` | None |

¹ Measured on 12 Oct 2026: Nuxt 4.6.0, two locales, three messages, one page. The JavaScript that `/`
loads (gzip -9), minus the same app without i18n. `bundle.runtimeOnly: true` did not change the
@nuxtjs/i18n result.

Choose @nuxtjs/i18n if you need domains per locale, the locale kept out of the URL (`no_prefix`), or
redirects by browser language. Ginko i18n leaves these out on purpose; [DECISIONS.md](https://github.com/lupinum-dev/ginko/blob/main/packages/ginko-i18n/DECISIONS.md)
gives the reasons.

## Requirements

- Nuxt 4.6 or later. Nuxt 5 is not supported yet.
- Node.js 22.18 or later, Node.js 24, or Node.js 26.
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
    defaultLocale: 'de', // a URL code: `/ueber-uns` and `/en/about`
    baseUrl: 'https://example.com', // absolute canonical and hreflang URLs
  },
})
```

**2. Add one message file per locale** in `i18n/`, next to `nuxt.config.ts`. The file name is the URL
code, not the language tag: `'de-AT'` has the code `de` (its language subtag, unless you set `code`), so
its file is `de.json`:

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

**3. Translate in pages and components.** `useI18n` and `<I18nT>` are auto-imported:

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
    <I18nT k="legal.consent">
      <template #link="{ text }">
        <NuxtLink :to="localePath('/privacy')">{{ text }}</NuxtLink>
      </template>
    </I18nT>
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

### Links and route names

Link with `localePath('/about')`. It takes a path written in any locale (`/about`, `/ueber-uns`,
`/en/about`) and returns the same page in the current locale, or in the locale you pass as the second
argument: `localePath('/about', 'en')`.

Do not navigate by route name. The module replaces each page route with one route per locale, named
`<name>__<code>` (`about__de`, `about__en`), so `navigateTo({ name: 'about' })` and
`<NuxtLink :to="{ name: 'about' }">` no longer resolve. The names are stable, but paths are the
supported way to link.

### Dynamic pages (CMS, content)

A page with a slug declares its per-locale paths before render, so the switcher, hreflang and the
server HTML agree. The function runs on the server and on client navigation:

```ts
// app/pages/blog/[slug].vue
definePageMeta({
  i18nAlternates: async (to, { locale, localePath }) => {
    const post = await $fetch<{ slugs: Record<string, string> }>('/api/post', { query: { slug: to.params.slug, locale } })
    return Object.fromEntries(Object.entries(post.slugs).map(([code, slug]) => [code, localePath(`/blog/${slug}`, code)]))
  },
})
```

Return `undefined` to fall back to the page's own routes. A locale missing from the result shows as not
translated. Link to content with the paths your content data provides, never with
`localePath('/blog/…')`: `localePath` translates app routes, not content slugs.

A Nuxt module that owns dynamic routes for many pages (a CMS) registers one resolver from its plugin
instead. A page's own `definePageMeta({ i18nAlternates })` wins; otherwise the first resolver that returns
paths does:

```ts
// runtime/plugin.ts of your module
export default defineNuxtPlugin(() => {
  addAlternatesResolver(async (to) => {
    if (!to.path.startsWith('/docs/')) return undefined // not ours
    return { de: '/docs/einstieg', en: '/en/docs/getting-started' }
  })
})
```

### Locale options per page

- `definePageMeta({ i18n: { paths: { de: '/ueber-uns' } } })`: translated paths.
- `definePageMeta({ i18n: { locales: ['de'] } })`: the page exists only in German.
- `definePageMeta({ i18n: false })`: one unlocalized page (for example `/studio`).

### SEO and sitemap

Every page gets `<html lang dir>`, a canonical link, hreflang links (with `x-default` for the default
locale) and `og:locale`. Pages that are not translated into a locale get no hreflang for it. Set
`baseUrl` so the links are absolute; without it the module uses `runtimeConfig.public.siteUrl`, and
without both the links are relative (the build warns). Turn the tags off with `seo: false`.

With `@nuxtjs/sitemap` installed, the module turns its `autoI18n` off and gives it explicit alternates,
because `@nuxtjs/sitemap` pairs locales by stripping the prefix, which is wrong for translated slugs.
This covers static pages only: pages with a dynamic segment (`/blog/[slug]`) are not in the list. Add
those URLs with their alternates through your own sitemap source, as `@nuxtjs/sitemap` describes for
dynamic URLs.

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
const { locale, locales, switchLocale } = useI18n()
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

`useI18n('cms')` then gives a translator whose keys are relative to that namespace. `namespace` is
required, so a library never overrides the app's own keys.

### Outside Nuxt

The translator also runs without Nuxt: in Convex functions, emails, scripts or another framework.
Compile the catalogs at build time with `@lupinum/ginko-i18n/compile`, then translate with
`@lupinum/ginko-i18n/core`, which ships no parser:

```ts
import { compileCatalogs } from '@lupinum/ginko-i18n/compile'
import { defineCatalog, type KeysOf } from '@lupinum/ginko-i18n/core'
import de from './i18n/de.json'
import en from './i18n/en.json'

const catalog = defineCatalog<KeysOf<typeof de>>(compileCatalogs({ de, en }), { defaultLocale: 'de' })

catalog.t('en-US', 'mail.invite.subject', { site: 'Gasthaus Grün' }) // a full tag finds `en`
catalog.t(undefined, 'mail.invite.subject', { site: 'Gasthaus Grün' }) // the default locale
```

`compileCatalogs` runs the parser, so call it where bundle size does not matter (a build step, a
server), or write its result to a file at build time. The result's shape is not public API: store
your source catalogs, not compiled trees, and compile again after an upgrade.

For one locale, `createTranslator` is the smaller building block, and the locale-path helpers apply the
module's URL rules anywhere:

```ts
import { compileTree } from '@lupinum/ginko-i18n/compile'
import { createTranslator, localizePath, negotiateLocale, resolveConfig } from '@lupinum/ginko-i18n/core'

const { t } = createTranslator({
  messages: compileTree({ greeting: 'Hallo {name}' }).tree,
  language: 'de-AT',
  timeZone: 'Europe/Vienna',
})
t('greeting', { name: 'Romi' }) // "Hallo Romi"

const config = resolveConfig({ locales: ['de-AT', 'en-GB'] })
localizePath('/about', 'en', config) // "/en/about"
negotiateLocale('en-US,en;q=0.9', config) // "en"
```

### Content Security Policy

The first page inlines its locale's messages in a `<script>` (`window.__GINKO_I18N__`), so hydration
needs no fetch. With `strategy: 'prefix'`, a static `/` also has a small inline redirect script. A
strict CSP must allow both (a nonce or a hash). If the inline script is blocked, the client loads the
messages as a script chunk instead.

## API

### `useI18n(namespace?)`

Auto-imported in components, pages and plugins.

| Return | Type | Meaning |
| --- | --- | --- |
| `t(key, params?, options?)` | `string` | The message in the current locale. Keys and parameters are typed from the default locale's files. `options.timeZone` formats this message's dates in another zone. |
| `parts(key, params?, options?)` | `Part[]` | The message as text and tag parts, for custom rendering of `<tag>…</tag>`. |
| `has(key)` | `boolean` | Whether the key exists in the current locale or the default locale. |
| `locale` | `ComputedRef<string>` | The current URL code (`'en'`). |
| `language` | `ComputedRef<string>` | The current BCP 47 tag (`'en-GB'`). |
| `locales` | `LocaleInfo[]` | Every locale: `{ code, language, name, dir }`. |
| `defaultLocale` | `string` | The default locale's code. |
| `localePath(path, code?)` | `string` | The same page in `code` (default: the current locale). Accepts paths only, not route objects. |
| `alternates` | `ComputedRef<Alternate[]>` | The current page in every locale: a `LocaleInfo` plus `path`, `current`, and `translated` (false when the page has no version there; `path` is then that locale's home). |
| `switchLocale(code)` | `Promise<void>` | Go to the current page in `code`, or change the user's locale inside a zone. |
| `format` | object | Intl formatting in the current language, see below. |

With a namespace, `useI18n('cms')` takes keys relative to it (`t('save')` for `cms.save`). The result's
type is `I18n<NS>`, for wrappers that take it as a parameter. New members will not reuse these names.

A missing key renders the key itself (and warns in dev), never an empty string. A key missing in one
locale shows the default locale's text.

`format` formats in the current language and the site's `timeZone`. Server and client produce the same
text. The examples are for `de-AT`:

| Method | Example |
| --- | --- |
| `format.date(value, style?)` | `format.date('2026-10-08')` → `8. Oktober 2026`. `style` is `'short'`, `'medium'`, `'long'` (default), `'full'` or `Intl.DateTimeFormatOptions`. A calendar date (`YYYY-MM-DD`) never shifts a day. |
| `format.range(from, to, style?)` | `format.range('2026-06-20', '2026-06-21')` → `20.–21. Juni 2026` |
| `format.relative(value, now?)` | `vor 5 Minuten`, `gestern`. Call it after mount or pass `now`: the text depends on the current time. |
| `format.number(value, options?)` | `format.number(1234.5)` → `1 234,5` (`Intl.NumberFormatOptions`) |
| `format.currency(value, currency)` | `format.currency(12.5, 'EUR')` → `€ 12,50` |
| `format.list(items, type?)` | `format.list(['Äpfel', 'Birnen', 'Pflaumen'])` → `Äpfel, Birnen und Pflaumen` (`'conjunction'` or `'disjunction'`) |

### `<I18nT>`

Renders a message that contains tags. Each tag calls the slot of the same name with `{ text }`, the
tag's content as plain text. A tag without a slot renders its content.

```vue
<I18nT k="legal.consent" :params="{ site: 'Gasthaus Grün' }">
  <template #link="{ text }"><NuxtLink to="/privacy">{{ text }}</NuxtLink></template>
</I18nT>
```

- `k`: a full key (library keys include their namespace). A missing key fails typecheck.
- `params`: the message parameters. They are not checked against the key; `t()` checks them.
- Parameter values stay text: `<b>` inside a value is never rendered as HTML.
- A slot gets plain text, so a tag nested inside a slotted tag is flattened.

### `useLocaleSuggestion()`

A `ComputedRef<Alternate | null>`: the current page in the visitor's browser language, when that is
another locale and the page exists there. `null` on the server and until the page has mounted. See
[Browser language](#browser-language).

### `addAlternatesResolver(resolver)`

For a module's Nuxt plugin that owns dynamic routes. The resolver gets the route and
`{ locale, localePath }` and returns a path per locale code, or `undefined` when the route is not its
own. See [Dynamic pages](#dynamic-pages-cms-content).

### `getI18n(event, namespace?)`

Auto-imported in server routes. Returns `{ locale, language, t, parts, has, format }` (type
`ServerI18n<NS>`) for the request's locale, with the same typed keys, namespace and formatters as
`useI18n()`. One difference: here `locale` and `language` are plain strings (`'en'`), while
`useI18n().locale` is a `ComputedRef<string>`.

### `definePageMeta`

- `i18n`: `{ paths?, locales? }` or `false`. See [Locale options per page](#locale-options-per-page).
- `i18nAlternates`: a resolver, as for `addAlternatesResolver`. See [Dynamic pages](#dynamic-pages-cms-content).
  It is a key of its own, not part of `i18n`: Nuxt reads `i18n` at build time only while it is plain
  data, so a function inside it would drop `paths` and `locales`.

### `@lupinum/ginko-i18n/core`

Framework-free and parser-free. See [Outside Nuxt](#outside-nuxt).

| Export | Meaning |
| --- | --- |
| `createTranslator({ messages, fallback?, language, timeZone?, params?, onMissing? })` | A `Translator` (`t`, `parts`, `has`) for one locale. Lookup: `messages`, then `fallback`, then the key itself. |
| `defineCatalog<K>(trees, { defaultLocale, params? })` | A `Catalog`: `t(locale, key, params?, options?)`, `translator(locale)`, `locales`, `defaultLocale`, `isLocale(value)`. An unknown locale gets the default; a full tag (`en-US`) finds its language. |
| `KeysOf<typeof catalog>` | The dotted keys of a source catalog type: `'mail.invite.subject' \| …`. |
| `createFormatters(language, { timeZone? })` | The `format` object of `useI18n()`. |
| `resolveConfig({ locales, defaultLocale?, strategy?, exclude?, userLocale? })` | The resolved locale config for the functions below. |
| `localizePath(path, code, config)` | Adds the prefix: `/about` → `/en/about`. |
| `stripLocale(path, config)` | Removes it: `/en/about` → `/about`. |
| `localeFromPath(path, config)` | The code a path belongs to, or `undefined` (`/de/x` under `prefix_except_default`). |
| `negotiateLocale(header, config)` | The best code for an `Accept-Language` header, or `undefined`. |
| `isExcluded(path, config)` | Whether the path never gets a prefix (`exclude`, `/api/**`, Nuxt internals). |
| `inUserZone(path, config)` | Whether the path is in a user-locale zone (`userLocale`). |
| `canonicalCase(path, config)` | The path with its prefix in the code's own case (`/EN/about` → `/en/about`), or `undefined` when it is already right. |
| `alternatesOf(paths, config)` | The hreflang links of a page from its path per code: `{ hreflang, path }[]`, with `x-default` for the default locale. The head tags and the sitemap use it. |
| `ogLocale(language)` | The `og:locale` form of a tag: `de-AT` → `de_AT`. |
| `partsToString(parts)` | The plain text of a `parts()` result. |

Types: `Translator`, `TranslateOptions`, `Params`, `Part`, `MessageTree`, `Catalog`, `Formatters`,
`FormatterOptions`, `DateStyle`, `LocaleInfo`, `LocaleInput`, `LocaleConfig`, `Strategy`.

### `@lupinum/ginko-i18n/compile`

Build time only: it loads the FormatJS parser.

| Export | Meaning |
| --- | --- |
| `compileCatalogs({ de, en })` | Compiles source catalogs per locale for `defineCatalog`. |
| `compileTree(raw)` | Compiles one locale: a `CompiledTree` `{ tree, params, numeric }`, where `params` lists each key's parameter names and `numeric` the ones used as numbers. |
| `MessageError` | Thrown for invalid ICU. `key` and `source` name the message. |

Types: `RawTree`, `CompiledTree`. The format inside `tree` is internal: it can change in any release,
and an old tree is not detected. Compile again after an upgrade.

### Types from `@lupinum/ginko-i18n`

`ModuleOptions`, `PageI18n`, `MessageSource` (for the `ginko-i18n:sources` hook), `I18n` (the result of
`useI18n`), `ServerI18n` (the result of `getI18n`), `Alternate`, `AlternatesResolver` and `TypedTranslator`.

## Message syntax

Messages are [ICU MessageFormat](https://unicode-org.github.io/icu/userguide/format_parse/messages/):

| Syntax | Example |
| --- | --- |
| Argument | `Hallo {name}` |
| Plural (`#` is the number) | `{count, plural, =0 {No items} one {# item} other {# items}}` |
| Ordinal | `{place, selectordinal, one {#st} two {#nd} few {#rd} other {#th}}` |
| Select | `{role, select, admin {Admin} other {Guest}}` |
| Number | `{total, number}`, `{share, number, percent}`, `{price, number, ::currency/EUR}` |
| Date and time | `{day, date, long}`, `{start, time, short}` |
| Tag | `I accept the <link>privacy policy</link>` (rendered with `<I18nT>`) |
| Literal text | `'{'` and `'<'` (an apostrophe quotes) |

Every `plural` and `select` needs an `other` case. Plural and number arguments are typed as `number`.

Keys are names, and nesting separates them: `t('nav.about')` reads `{ "nav": { "about": … } }`. So a
key must not contain `.` and must not be empty. The build, `compileTree` and the CLI fail on such a key
and show the nested form to use.

## Coming from @nuxtjs/i18n

Remove `@nuxtjs/i18n` first: both modules cannot own the locale, and setup fails if both are installed.

**Messages.** Ginko i18n reads ICU, not the vue-i18n syntax:

| vue-i18n | ICU |
| --- | --- |
| `Hello {name}` | `Hello {name}` (unchanged) |
| `no apples \| one apple \| {count} apples` | `{count, plural, =0 {no apples} one {one apple} other {# apples}}` |
| `{n} items` with `$t(key, n)` | `{n, plural, other {# items}}` with `t(key, { n })` |
| `@:common.brand` (linked message) | Not supported: write the text, or pass it as a parameter. |
| `{'@'}` (literal) | `@` needs no escape; quote `{` as `'{'`. |
| `@.lower:key` (modifier) | Not supported: format in code. |

**Code.**

| @nuxtjs/i18n | Ginko i18n |
| --- | --- |
| `$t('key')` in templates | `const { t } = useI18n()`, then `t('key')` |
| `useI18n().locale.value = 'en'`, `setLocale('en')` | `switchLocale('en')` |
| `localePath('about')` (route name), `localeRoute`, `<NuxtLinkLocale>` | `localePath('/about')` (paths only) with `<NuxtLink>` |
| `switchLocalePath('en')` | `alternates`, or `localePath(route.path, 'en')` |
| `<i18n-t keypath="…">` | `<I18nT k="…">` with a slot per tag |
| `useLocaleHead()` | Nothing to call: head tags are automatic (`seo: true`). |
| `$n`, `$d` | `format.number`, `format.date` |
| Route names `about___en` | `about__en`; link by path instead (see [Links and route names](#links-and-route-names)). |

**Options.**

| @nuxtjs/i18n | Ginko i18n |
| --- | --- |
| `locales: [{ code, language, file }]` | `locales: ['de-AT', { language: 'en-GB', code: 'en' }]`; files are always `i18n/<code>.json`. |
| `defaultLocale` | `defaultLocale` |
| `strategy: 'prefix_except_default' \| 'prefix'` | the same |
| `strategy: 'no_prefix'`, `'prefix_and_default'`, `differentDomains` | Not supported: the URL is the only locale source. For apps behind a login, use `userLocale`. |
| `detectBrowserLanguage` | No redirect; `useLocaleSuggestion()` offers a link instead. `/` under `prefix` redirects by cookie and browser language. |
| `customRoutes: 'config'`, `pages: {…}` | `definePageMeta({ i18n: { paths } })` in each page |
| `baseUrl` | `baseUrl` (falls back to `runtimeConfig.public.siteUrl`) |
| `vueI18n: './i18n.config.ts'` | Not needed: formats come from `Intl`. |

## Options

| Option | Default | Meaning |
| --- | --- | --- |
| `locales` | (required) | BCP 47 tags such as `'de-AT'`, or `{ language, code?, name? }`. The URL code defaults to the language subtag (`de-AT` → `de`); the name to the native name from `Intl.DisplayNames`. |
| `defaultLocale` | first locale | The code of the locale with no prefix under `prefix_except_default`, and the fallback for missing messages: `'de'`, not `'de-AT'`. |
| `strategy` | `'prefix_except_default'` | Or `'prefix'`: every locale has a prefix and `/` redirects. |
| `seo` | `true` | Head tags: `lang`, `dir`, canonical, hreflang with x-default, `og:locale`. `false` turns them off. |
| `baseUrl` | `runtimeConfig.public.siteUrl` | Absolute site URL for canonical and hreflang. Set it in production. |
| `params` | `{}` | Parameters every message can use, for example `{ tone: 'sie' }` for `{tone, select, …}`. |
| `exclude` | `[]` | Extra unprefixed paths. `/api/**` and Nuxt internals are always excluded. |
| `userLocale` | `[]` | Paths whose locale comes from the user (cookie, then `Accept-Language`), not the URL, for apps behind a login: `['/app/**']`. See [Apps and SaaS](#apps-and-saas). |
| `timeZone` | `'UTC'` | IANA time zone of the site (`'Europe/Vienna'`) for timestamps in `format.date` and `{d, date}` / `{d, time}` in messages. Calendar dates (`2026-10-08`) always stay on their day. One call can use another zone: `t('key', params, { timeZone: site.timezone })`, e.g. in an app that shows times of a site somewhere else. |

A pattern in `exclude` and `userLocale` is an exact path (`'/studio'`) or a prefix that ends in `/**`
(`'/app/**'` matches `/app` and everything below it; `'/**'` matches every path). It starts with `/`.
No other `*` is allowed: `'/app/*'` fails setup with a message.

Any other option fails setup with a message: Ginko i18n is not a drop-in for `@nuxtjs/i18n` options.

A missing translation shows the default locale's text. The build and dev server list the missing
keys per locale, and `ginko-i18n check` fails CI on them.

## CLI

The CLI reads Nuxt's generated `ginko-i18n/manifest.json` and the original message
files. It needs no browser. It is tested on macOS and Linux.

```sh
npx ginko-i18n check --json
npx ginko-i18n todo --locale en --json
npx ginko-i18n apply translations.json --json
```

Global options are `--cwd <app>` (defaults to the current directory),
`--build-dir <dir>` (defaults to `<app>/.nuxt`), `--json`, and `--help`.

To check a plain catalog folder with one `<code>.json` file per locale, with no
Nuxt app, add `--dir <folder> --default-locale <code>`. Relative paths resolve from
`--cwd`. `--default-locale` must name a locale file in the folder, and both options go
together. `i18n.lock.json` and `glossary.json` are then read and written in that
folder. Without source directories, `check` skips the unused-key check and sets
`summary.unusedSkipped` to `true`:

```sh
npx ginko-i18n todo --dir locales --default-locale de --locale es --json
```

In this mode `todo` and `apply` also accept a locale that has no file yet, such as `es`
above: `apply` then creates `es.json`.

Relative build, input, and HTML paths resolve from the app directory. If the
manifest is absent, the CLI runs the app's local `nuxt prepare` once. Preparation
writes Nuxt build files; with an existing manifest, `check` only reads files.
Preparation logs go to stderr. The manifest has a `version`; a CLI of another
version refuses it (run `nuxt prepare` again).

With `--json`, stdout is exactly one JSON object for every command, also for errors:

| Result | Shape |
| --- | --- |
| `check` | `{ ok, summary, findings }` |
| `todo` | `{ ok, locale, language, sourceLocale, sourceLanguage, params, glossary, items }` |
| `apply` | `{ ok, written, rejected, warnings }` |
| `--help` | `{ ok, help }` |
| Usage or configuration error | `{ ok: false, error: { code, message } }`, where `code` is `usage` (the command line) or `config` (manifest, message files, apply input) |

`ok` is `true` exactly when the exit code is `0`.

`check` reports missing and extra translations, invalid ICU, parameter differences,
incomplete plural categories, stale translations, unknown static keys, and unused
app/layer keys. Parameters declared in the manifest are optional on either side.
Static usages include `t('key')`, literal backticks, `<I18nT k="key">`, and simple
`const x = useI18n('namespace')` followed by `x.t('key')`. Any dynamic translation
call suppresses unused warnings and sets `summary.unusedSkipped` to `true`.
The scanner is a conservative text scan, not a JavaScript parser; comments and
strings containing call-shaped text can count as usages.

Use `check --locale <code>` to list only one locale's findings, for example while
translating it. `ok`, `summary` and the exit code still count every finding, so an
`unknown-key` error (which has no locale) still fails the run. An unknown code is a
usage error.

Use `check --html <built-html-directory>` to validate canonical URLs, self and
reciprocal hreflang links, x-default, and HTML language. Error documents and
noindex pages are ignored. URL paths identify local HTML files regardless of origin.

`todo --locale <code>` lists missing and stale translations. Each item has:

- `key`, and `code`: `missing` or `stale`, as in the findings of `check`.
- `file`: the file `apply` will write. Keys from a layer go to that layer's folder,
  which other sites may share; library keys go to the app.
- `source`: the default locale's ICU text, and `current`: the translation, when there is one.
- `params`: the source's parameter names.
- `usages`: static usages in the code, as `{ file, line }`.

Use `--only missing` or `--only stale` to narrow the list.

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

`locale` must not be the default locale: its files are the source. Each item must
compile and use the source parameters, except global parameters.
Missing plural categories produce a warning in the result's `warnings` (with sample
numbers, such as `many (e.g. 1000000)` for Italian) but do not reject a translation.
Valid items are saved even if other items are rejected; `written` lists them as
`{ key, file }`, `rejected` the others as `{ key, reason }`. Layer/app keys go to the
source directory that defines the default message. Library keys go to the app's
`i18n/<code>.json`, including their namespace. Keys follow default-source order;
unrelated keys remain, with two-space indentation and a trailing newline.
The app's `i18n/i18n.lock.json` records the SHA-256 hash of each translated source.
A changed hash produces a stale warning on subsequent checks. Do not edit source
files concurrently with apply; apply reads and rewrites each affected JSON file.

Each finding in the JSON output has `code`, `severity` (`error` or `warning`), a `message`, and
where they apply `locale`, `key`, `file` and `line`. The `code` values are:

| `code` | Severity | Meaning |
| --- | --- | --- |
| `missing` | error | A locale has no translation for a key of the default locale. |
| `stale` | warning | The source text changed after the translation was applied. |
| `extra` | warning | A locale has a key that the default locale does not have. |
| `plural-missing` | warning | A plural message lacks a category that the locale's language needs. |
| `params-mismatch` | error | A translation uses other parameters than the source. |
| `invalid-icu` | error | A message is not valid ICU syntax. |
| `unknown-key` | error | The code uses a static key that no file defines. |
| `unused` | warning | No static usage found for a key (skipped when `summary.unusedSkipped` is `true`). |
| `seo-canonical`, `seo-hreflang-self`, `seo-hreflang-reciprocal`, `seo-x-default`, `seo-lang` | error | Problems that `check --html` finds in built pages. |

Exit codes: `0` means no errors, `1` means check errors or rejected apply items,
and `2` means invalid usage or configuration. Warnings alone return `0`.

## Troubleshooting

Every error starts with `[ginko-i18n]` and ends with `Fix: …`. The common ones:

- **Unknown option(s) i18n.…**: an option from `@nuxtjs/i18n`. See [Coming from @nuxtjs/i18n](#coming-from-nuxtjsi18n).
- **@nuxtjs/i18n is also installed**: remove one of the two modules.
- **Two locales use the URL code "…"**: `de-AT` and `de-CH` both become `de`. Give one an explicit `code`.
- **Message "…" is not valid ICU**: the message and its key are in the error. Every `plural` and `select` needs `other`.
- **Manifest missing** (CLI): add the module to `nuxt.config` and run `nuxt prepare`.
- **A link by route name does not resolve** (`{ name: 'about' }`): localized routes are named `about__de`, `about__en`. Link with `localePath('/about')`.

## Contributing

Ginko i18n lives in the [Ginko monorepo](https://github.com/lupinum-dev/ginko) under `packages/ginko-i18n`. Run `pnpm test` and `pnpm typecheck` there before you open a pull request. The design decisions and their evidence are in [DECISIONS.md](https://github.com/lupinum-dev/ginko/blob/main/packages/ginko-i18n/DECISIONS.md); change one only with new evidence.

## Support and security

Ask questions in the [Lupinum OSS Discord](https://discord.lupinum.com). Report vulnerabilities privately through [GitHub private vulnerability reporting](https://github.com/lupinum-dev/ginko/security/advisories/new).

## License

[MIT](https://github.com/lupinum-dev/ginko/blob/main/LICENSE) © Lupinum OG.
