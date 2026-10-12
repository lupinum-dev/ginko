# Platform research: Nuxt 5, Nitro v3, srvx

Date: 2026-10-07. Sources: `~/Git/alignment/{nuxt (5.0.0-0, 04849440a), nitro (3.0.260903-beta), srvx (1.0.5), nuxt-sitemap (8.5.1), nuxt-og-image (6.9.1), nuxt-module}`. Paths below are relative to those repos. **[inferred]** marks conclusions I did not read directly in source.

## Summary

1. Nuxt 5 has no built-in i18n. It explicitly supports "route localization", meaning one shallow copy of each page per locale, made in `pages:extend`/`pages:resolved` (nuxt `packages/nuxt/src/pages/utils.ts:254-256`). That is the native way to do routing.
2. Localized routes must be real pages. Typed routes, early-404, `ssrRoutes` and prerender seeding are all computed from `nuxt.apps.default.pages`. Middleware rewrites and `router.options` route edits fight these features.
3. `definePageMeta` keys are now extracted at build time (`extractSerializablePageMeta` on by default). A per-page `i18n: { paths }` key can be read in `pages:resolved` without our own parser.
4. Server code should target `nuxt/server` (portable across server builders). Nitro is still needed for plugins, cache, storage and `render:html`.
5. Kit has a portable server middleware: `addServerHandler({ route: '/**', middleware: true, handler: { nuxt: path } })`. Nitro v3 needs an explicit route.
6. `event.context` is the bridge from server to app. Middleware sets `event.context.locale`, SSR reads it with `useRequestEvent()`, and the client gets it through the payload or state.
7. Nitro route rules support `/de/**` globs but have no locale concept and no custom-rule extension point. Cache rules have `varies` and `allowCookies` for per-locale cache keys.
8. Nothing in Nitro, h3 or srvx parses `Accept-Language`. We need about 30 lines of parsing plus `Intl.Locale#maximize` for matching. Node 24 has `Intl.Locale#getTextInfo()` for `dir`.
9. unhead v3 deduplicates `<link rel="alternate" hreflang>` by hreflang and canonical by rel. `useHead` is enough for `lang`, `dir` and alternates.
10. Fragile areas:
    - Islands, including OG images: the request path has no locale prefix.
    - Sitemap: it only recognises `@nuxtjs/i18n` and `nuxt-i18n-micro` by name.
    - `sharedPrerenderData` keys that leave out the locale.
    - Cached routes keyed on headers or cookies.

## 1. Nuxt 5 changes relevant to i18n

### Routing
- **Hook order.** `augmentAndResolve` runs `pages:extend`, then `augmentPages` (meta extraction), then `pages:resolved` (`packages/nuxt/src/pages/utils.ts:133-166`).
  - The default `scanPageMeta` is `'after-resolve'` (`packages/schema/src/config/experimental.ts:215-219`). So page meta is **not** available in `pages:extend`, only in `pages:resolved`.
- **Supported pattern.** Core comments that modules "replace the page objects wholesale (route localization emits a shallow copy per locale)". Dynamic meta is keyed by `page.file`, so clones keep working (`pages/utils.ts:248-262`).
- **Serializable page meta.** Every JSON-serializable `definePageMeta` key is written into the route record (upgrade guide `docs/1.getting-started/18.upgrade.md:157-177`, default `experimental.ts:221-225`). `definePageMeta({ i18n: { paths: { de: '/ueber-uns' } } })` therefore reaches `pages:resolved` as data.
- **Typed pages are on by default** (`18.upgrade.md:1325-1349`; `experimental.ts:194-196`). The vue-router 5 typed map is built from `nuxt.apps.default.pages`, i.e. after our hooks (`pages/module.ts:328-336`). So **every localized clone becomes a named, typed route** [inferred: N× entries in `RouteNamedMap`].
- **Prerender seeding.** Core's own `pages:resolved` listener adds static routes to the prerender set (`pages/module.ts:528-557`). It registers before user modules [inferred from module install order], so routes added in *our* `pages:resolved` may miss this set.
  - With `crawlLinks` + SSR, only the first route is seeded (`pages/module.ts:671-677`). Nitro then discovers the rest by crawling.
- **Other consumers of the final page tree.** `nitro:build:before` turns it into `ssrRoutes` and early-404 patterns (`pages/module.ts:603-651`).
  - `early404` is opt-in (`experimental.ts:170`). It is disabled when a `router.options` file may modify `routes` (`docs/3.guide/6.going-further/1.experimental-features.md:265-288`).
- **Case-sensitive routing** is now the default (`18.upgrade.md:115-135`). Locale prefixes must be emitted in one canonical case, e.g. `/de`, not `/DE`.
- **Inline route rules.** `NuxtPage.rules` comes from `defineRouteRules` (`packages/schema/src/types/hooks.ts:62-63`) and is still behind `experimental.inlineRouteRules: false`.
- **App-side route rules** (`AppRouteRulesBase`) include `redirect`, `prerender`, `ssr` and `appMiddleware` (`packages/schema/src/types/server.ts:188-200`).
- **Kit:** `extendPages`, `extendRouteRules` and `addRouteMiddleware` (`packages/kit/src/pages.ts:9,21,44`).
- **No route groups or new layout concepts** affect i18n. I found no i18n mention in Nuxt docs except an auto-import example (`docs/3.guide/1.concepts/3.auto-imports.md:190`).

### App runtime
- **Request access during SSR:**
  - `useRequestEvent()` returns `ssrContext.event` (`packages/nuxt/src/app/composables/ssr.ts:17-21`).
  - `useRequestHeader()` reads `event.req.headers` (web `Headers`) (`ssr.ts:46-50`).
  - `prerenderRoutes()` pushes to `event.context.nuxt.prerenderRoutes` (`ssr.ts:158-167`). This is the portable "also prerender these" channel (`schema/src/types/server.ts:115-123`).
- **Payload.** `payloadExtraction` now defaults to `'client'`: payload is inlined on the first render and `_payload.json` is fetched on navigation (`18.upgrade.md:179-201`).
  - `sharedPrerenderData` is on by default and shares `useAsyncData` results by key across prerendered pages (`1.experimental-features.md:502-524`). **Message fetch keys must include the locale.**
- **`useState`:** unchanged signature (`app/composables/state.ts:17-19`). `clearNuxtState` now resets to the init value (`18.upgrade.md:203-225`).
- **`useCookie`:** cookieStore sync is on by default (`1.experimental-features.md`, `cookieStore`; `app/composables/cookie.ts:96-98`).
- **`<NuxtTime>`** already takes a `locale` prop and pins the SSR locale during hydration via `data-locale` (`app/components/nuxt-time.vue:40-60`). Our module could feed it.
- **Islands.** The island SSR context uses `url: islandContext.url`, i.e. the page URL sent by the client (`packages/nitro-server/src/runtime/handlers/island.ts:131-137, 361`). The HTTP request path is `/__nuxt_island/...`. **Server middleware that reads `event.url` gets the wrong locale for islands.** In-app code that resolves the locale from the route gets the right one [inferred].

### Head (unhead v3)
- Nuxt pins `unhead`/`@unhead/vue` `^3.4.1` (`pnpm-workspace.yaml:77,97`).
- Server-only head composables are no longer auto-imported (`18.upgrade.md:903-933`). `experimental.headNext` (capo ordering, hash hydration) is on (`1.experimental-features.md:1081-1096`).
- **Deduplication** (unhead 3.2.3 dist `shared/unhead.DgxHWvUc.mjs:13-22`, installed under nuxt-og-image): `link[rel=canonical]` gets the key `canonical`, and `link[rel=alternate][hreflang]` gets the key `alternate:<hreflang>`. Pages can safely override module-set alternates.
- `htmlAttrs.lang` and `dir` (`'ltr'|'rtl'|'auto'`) are typed (`unhead.DZtuWlyq.d.ts:100,178`). Nuxt sets no default `lang` [inferred: no `htmlAttrs` default in `schema/src/config/app.ts`].

### Server surface and builders
- **`nuxt/server`** is the portable server API: handlers, cookies, headers, `getRouteRules`, `useRuntimeConfig`, sessions, `deriveSecret` (`docs/3.guide/6.going-further/5.server-imports.md:31-55`; `packages/nuxt/src/server/index.ts:1-73`).
  - Its `RequestEvent` is `{ req: Request, url: URL, res, context }`, and `RequestEventContext` is an open record (`schema/src/types/server.ts:138-161`).
  - Not portable: storage, cache, server plugins, runtime hooks incl. `render:html`, `serverFetch` (`5.server-imports.md:179-187`).
- **Server builders.** `@nuxt/nitro-server` is the default; `@nuxt/vite-server` is experimental (`docs/3.guide/6.going-further/8.builders.md:8-11`). Kit resolves `nuxt`/`nitro3`/`nitro2` handler variants per host (`packages/kit/src/nitro.ts:9-30, 148-163`).
- **Nitro plugins** have no portable variant: "`nuxt/server` has no plugin surface" (`kit/src/nitro.ts:181-200`).
- **Nitro v3 behaviour changes:**
  - Middleware without a route is gone. Routed middleware no longer matches subpaths, so register `route: '/**', middleware: true` (`docs/3.guide/4.modules/9.server-compatibility.md:167-175`).
  - `beforeResponse`/`afterResponse` became `response` (`18.upgrade.md:864-869`).
  - `useRuntimeConfig()` takes no event (`18.upgrade.md:778-787`).
  - Route rule types are augmented on `h3/rules` (`RouteRuleConfig` + `RouteRules`) (`18.upgrade.md:818-843`).
  - Cached route rules drop the query string unless `allowQuery` is set (`18.upgrade.md:806-816`).
  - Server auto-imports are opt-in (`18.upgrade.md:658-682`).
- **Typed `$fetch`** now comes from the routes the server builder reports, through `ServerRoutes` in `@nuxt/schema` (`18.upgrade.md:1351-1411`).

### Build and module authoring
- **Vite 8 / Rolldown**, Vite Environment API always on. Target environments with `applyToEnvironment`/`configEnvironment`, not `{ server: false }` (`18.upgrade.md:359-468, 470-490`).
- **Nitro builds as a Vite environment** (`nitroViteEnvironment` default true). `nitro.rollupConfig` no longer reaches the server build (`18.upgrade.md:492-514`).
- **Cross-builder transforms:** `addBuildPlugin` (unplugin) works across builders (`8.builders.md:100-104`). This is the right tool for a message-compile/tree-shake transform [inferred].
- **Module dependencies.** `moduleDependencies` with `optional`/`defaults`/`overrides` replaces `installModule` (`docs/3.guide/4.modules/4.module-dependencies.md:6-84`).
- **Type templates.** `addTypeTemplate(tpl, { nuxt, nitro, node, shared })` registers types per tsconfig context (`kit/src/template.ts:73-127`).
  - `addServerTemplate` creates Nitro virtual files (`docs/3.guide/4.modules/5.recipes-advanced.md:100-112`).
- **Prerender.** `addPrerenderRoutes` hooks `prerender:routes` (`kit/src/nitro.ts:212-225`).
- **Layers.** `getLayerDirectories()` exposes `app`, `appPages`, `shared`, `server`, `public` per layer, highest priority first (`kit/src/layers.ts:7-37`). Use it to merge `locales/` dirs from layers [inferred].
- **`shared/`** is auto-imported in app and server, but cannot import Vue or Nitro code (`docs/2.directory-structure/1.shared.md:15-34`). It is a good home for locale config, the negotiation function and message types.
- **Async context.** Nuxt's `experimental.asyncContext` (default false, `experimental.ts:212`) is forwarded to Nitro (`packages/nitro-server/src/index.ts:243`).

## 2. Nitro v3 (h3 v2)

- **Event.** `H3Event` has `req` (srvx `ServerRequest`, a web `Request`), `url: URL`, `context`, `res`, `runtime` and `waitUntil` (h3 2.0.1-rc.22 `dist/h3.d.mts:714-810`).
  - Nuxt pins `h3 ^2.0.1-rc.31` and `nitro ^3.0.260903-beta`, `srvx ^1.0.3` (`pnpm-workspace.yaml:108-109,270`).
  - `getRequestHeader` is deprecated in favour of `event.req.headers.get()` (h3 `index.d.mts:1178`).
- **Middleware.** Order: `request` hook → route-rule middleware (`event.context.routeRules` available) → static assets → global middleware → routed middleware → handler/renderer → `response` hook (nitro `docs/1.docs/50.lifecycle.md:24-143`).
  - `server/middleware/*` files are ordered by filename (`docs/1.docs/5.routing.md:349-388`).
- **routeRules.** Keys: `headers`, `redirect`, `proxy`, `cors`, `cache`, `swr`, `static`, `prerender`, `isr`; `basicAuth` was removed (`5.routing.md:690-702`; `src/config/resolvers/route-rules.ts:14-19`).
  - rou3 globs such as `/de/**` work, and rules merge from least to most specific (`5.routing.md:444-486`).
  - **No locale awareness and no custom rule handlers** (only `cache` is overridable, `src/build/virtual/routing.ts:19-20`).
  - Rules can be added via `extendRouteRules` (Nuxt) or `nitro.updateConfig` (`src/config/update.ts:6-11`).
- **Hooks.** Runtime: `request`, `response`, `error`, `close` (`src/types/runtime/nitro.ts:52-57`). Build: `prerender:routes`, `prerender:generate`, `prerender:route`, `prerender:done` (`src/types/hooks.ts:26-29`). The plugin API is `definePlugin` from `nitro` (`src/runtime/nitro.ts:11`).
- **Cache.** `defineCachedFunction`/`defineCachedHandler` come from `nitro/cache`.
  - `varies: ['accept-language']` keys the cache on that header and strips all other headers before the handler (`docs/1.docs/7.cache.md:246-250`).
  - `allowCookies` names a `locale` cookie as a safe example but emits `Vary: Cookie` (`7.cache.md:256-259`).
  - **Path-prefixed locales need neither option.** The cache key already includes the path (`7.cache.md:365`).
- **Prerender.**
  - `prerender: true` rules do not expand wildcards; use crawling or `prerender:routes` (`docs/1.docs/50.prerendering.md:31-46`).
  - The crawler follows `href`s in rendered HTML (`:49-66`).
  - The `x-nitro-prerender` header queues routes (`:69`). Nuxt's `prerenderRoutes()` feeds that header.
- **No typed fetch in Nitro v3.** Nuxt replaced it (see above). `serverFetch()` from `nitro` makes in-process calls (`src/runtime/nitro.ts:31-62`).
- **Locale outside handlers** (emails, errors). `useRequest()` from `nitro/context` returns the srvx request and requires `experimental.asyncContext` plus AsyncLocalStorage (`src/runtime/internal/context.ts:20-34`; `docs/1.docs/62.utils.md:235-248`).
  - Nitro passes the same `req` to h3, so `req.context` is shared with `event.context` [inferred from `src/build/virtual/app.ts:85-100`].
  - Clean pattern: middleware writes `event.context.locale`; utilities take `event` explicitly, or use `useRequest().context.locale` when async context is on.
- **Vite-native Nitro.** `nitro/vite` plugin with `client`/`nitro`/`ssr` environments (`docs/1.docs/61.vite.md:13-22, 227`). There is no Nuxt-specific guide; Nuxt drives it via `nitroViteEnvironment`.

## 3. srvx

- srvx is a universal fetch-style server: `serve({ fetch(req) => Response })` (`docs/1.guide/02.handler.md:9-27`).
- `ServerRequest extends Request` and adds `ip`, `runtime`, `context`, `waitUntil` (`src/types.ts:360-396`).
- Middleware is `(req, next) => Response`; plugins are `(server) => void` (`src/types.ts:45-50`; `docs/1.guide/04.middleware.md:46-50`).
- **No locale or Accept-Language support** (only TLS/compression "negotiation" in `src/mtls.ts`, `src/static.ts`).
- We never touch srvx directly inside Nuxt. It matters only because `req.context` is the shared per-request bag [inferred].

## 4. Web platform

- **No `Accept-Language` parser** exists in h3, srvx, Nitro or Nuxt; only the header-name type in h3 `h3.d.mts:208`. Write a q-value parser (about 20 lines) in `shared/`.
- **Probed on Node v24.18.0:**
  - `Intl.Locale`: `maximize()` gives `ar-Arab-EG`; `getTextInfo()` gives `{ direction: 'rtl' }`.
  - `Intl.DisplayNames`: `de` + `fr` gives "Französisch". Use it for language-switcher labels.
  - `Intl.PluralRules` (ar gives 6 categories), `Intl.DurationFormat`, `Intl.getCanonicalLocales`, global `navigator.language`, `URLPattern`.
  - `Intl.LocaleMatcher` is **undefined** (still a proposal). Build matching as: exact tag → maximized script/region match → base language → default.
- **Gaps:** `getTextInfo` browser support beyond Chromium is not verified [inferred risk]. Keep a fallback RTL list (`ar`, `he`, `fa`, `ur`, ...) or let config declare `dir`.

## 5. Ecosystem integration (sitemap, og-image, site-config)

- **nuxt-sitemap**
  - Auto-detects only `['@nuxtjs/i18n','nuxt-i18n-micro']` (`nuxt-sitemap/src/module.ts:246`).
  - Build-time alternates come from route names split on `___` (`src/utils-internal/nuxtSitemap.ts:95,146-209`).
  - **Generic path:** set `sitemap.autoI18n = { locales (with _hreflang, _sitemap), defaultLocale, strategy }` before sitemap runs. A user object is used as-is (`module.ts:242`). Runtime alternates are then derived from path prefixes (`src/runtime/server/sitemap/builder/entries.ts:93-146`).
  - This only pairs URLs that share the *same unprefixed path*. Translated slugs need explicit `alternatives` via the `sitemap:input` Nitro hook (`src/templates.ts:13-18`).
  - Using `___` route names without being a recognised module is likely to yield `hreflang: undefined` [inferred, `nuxtSitemap.ts:190-196`]. **Use a different route-name separator** or upstream a provider API.
- **nuxt-og-image**
  - Has no locale logic. Its docs say islands lack the locale prefix and cookies, and recommend passing translated strings or a `locale` prop (`docs/content/4.integrations/3.i18n.md:106-122`).
  - Hook point: the Nitro hook `nuxt-og-image:context` with `ctx.basePath` (`src/runtime/server/og-image/context.ts:274-295`). The cache key already includes `basePath` (`context.ts:34-51`).
- **nuxt-site-config**
  - Hardcodes the same two modules.
  - Offers a generic per-request hook `site-config:init({ siteConfig, event })`, where we can push `currentLocale`/`defaultLocale` (site-config 4.1.2 `dist/runtime/server/middleware/init.js:52-54`).
  - At build time, use `updateSiteConfig`.

## 6. Recommendation: native hook points

1. **Routing: clone pages per locale in `pages:resolved`**, not in `router.options`, router `base`, or a server rewrite.
   - Read `page.meta.i18n` (extracted at build time), emit one record per locale with a prefixed or translated path, and keep `file`.
   - This keeps typed routes, early-404, `ssrRoutes`, KeepAlive names and prerender consistent.
   - Name clones `<name>-<locale>` or similar, but **not `___`** (sitemap).
   - Decide deliberately whether clones should be typed routes. The alternative is `alias` records [inferred trade-off: fewer typed names, but `router.resolve({name})` returns only the primary path].
2. **Prerender: call `addPrerenderRoutes`** (or hook `prerender:routes`) with every static localized path, because core's seeding may run before our `pages:resolved` listener.
   - Also call `prerenderRoutes()` in the language switcher for dynamic pages. Never rely on crawling alone.
3. **Server locale: one portable middleware.** Register it via `addServerHandler({ route: '/**', middleware: true, handler: { nuxt: resolve('runtime/server/locale') } })`, importing only `nuxt/server`.
   - Resolution order: path prefix → cookie → `Accept-Language` → default. Set `event.context.locale`.
   - Do the redirect for the root path here, using `sendRedirect`.
4. **App locale: a plugin that reads the route first**, then `useRequestEvent()?.context.locale` on the server, and stores it in `useState('ginko:locale')`.
   - Route first makes islands and client navigation correct.
5. **Head: one `useHead` call in the plugin.** Set `htmlAttrs: { lang, dir }`, a canonical link, `link rel=alternate hreflang` for each locale plus `x-default`, and `og:locale`. unhead deduplicates by hreflang, so pages can override.
6. **Types:**
   - `addTypeTemplate({ filename: 'types/ginko-i18n.d.ts' }, { nuxt: true, nitro: true, shared: true })` for the locale union and message keys.
   - Augment `h3/rules` only if we add a route-rule key, which I advise against.
7. **Shared core in `shared/`-compatible code:** locale list, negotiation, the `t()` formatter on `Intl.PluralRules`/`NumberFormat`/`DateTimeFormat`. The same code then translates in Vue, in server routes (emails, API errors via `event.context.locale`), and in Nitro hooks.
8. **Messages:** load per locale with a locale-scoped key, e.g. `useAsyncData(\`ginko:msgs:${locale}\`)`, or as static imports compiled by an `addBuildPlugin` transform. Never use a shared key (`sharedPrerenderData`).
9. **Ecosystem:** use `moduleDependencies` with `optional: true` and `defaults` to fill `sitemap.autoI18n` and site-config. Use the Nitro hooks `nuxt-og-image:context`, `site-config:init` and `sitemap:input` for per-request data.

### Fragile areas (keep out of v1 or isolate)

- **Detecting the locale from cookies or `Accept-Language` on cached or prerendered pages.** Prerendered HTML cannot vary. Cached routes need `varies`/`allowCookies`, which hurt CDN hit rates. Prefer locale-in-URL.
- **Islands and OG images:** the request path is `/__nuxt_island/...`. The locale must come from the island URL in the app context or from a prop.
- **Using `router.options` to rewrite routes:** it disables early-404 and bypasses typed pages.
- **Server-side rewrites of `/de/x` to `/x`:** the page tree and URL disagree, and links, typed routes and prerender all break [inferred].
- **Different domains per locale:** depends on host headers, site-config and sitemap's `multiDomainLocales`. Defer.
- **Supporting Nuxt < 4.6 or Nitro v2:** needs `nitro2` handler variants. Skip, since the target is Nuxt 5.
- **`useRequest()` async context:** experimental and Node-only, so it should not be required.
- **Relying on sitemap auto-detection:** it is hardcoded to other modules' names until upstreamed.

### Verified in the skeleton (2026-10-07)

- **Native module loading on Nuxt 5.** Nuxt 5 loads a module with Node's type stripping. Relative imports
  need a `.ts` extension, and TypeScript-only runtime syntax (constructor parameter properties, enums)
  is not allowed. Otherwise Nuxt falls back to jiti with warning `NUXT_B8023`.
- **Typed router (vue-router 5).** Route names computed at runtime (`${base}__${code}`) are not in the
  typed route map. One helper (`resolveClone` in `runtime/composables.ts`) does the cast. Alternates
  resolvers get `RouteLocationNormalizedGeneric`, so `to.params.slug` needs no narrowing.
- **Alias folders.** Nuxt adds the `#alias/*` tsconfig path only when the folder exists when it writes
  the tsconfig. The module creates `.nuxt/ginko-i18n` at setup, so a fresh checkout typechecks.
- **Nuxt 4.6 with `future.compatibilityVersion: 5`** (`apps/n4c5`): it runs on Nitro 2 and passes the
  full browser suite (724/724). Typecheck fails for every such project (reproduced standalone):
  `nitro.prerender` in `nuxt.config` and `nitro.alias` in a `nitro:config` hook. The cause is
  `nitropack/types`: its published entry re-exports a path without extension, which NodeNext cannot
  follow. Upstream draft: `research/upstream/nitro-types-nodenext.md`.
