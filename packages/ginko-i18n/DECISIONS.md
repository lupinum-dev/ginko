# ginko-i18n decisions

Each decision says what we chose, why, and the evidence that settled it. Change a decision only with
new evidence, and record the change here.

These decisions come from the standalone `ginko-i18n` repository (D1–D14, October 2026). The monorepo
keeps their numbers, so older notes and commits still point to the right place. Where the monorepo
changed a decision, the entry says so under **Now**. The research notes behind the evidence are in
[research/](research/).

Terms:
- **Locale:** a language version of the site, such as `de` or `en`.
- **Strategy:** how the locale appears in the URL.
- **Hydration:** the browser takes over the HTML the server rendered. If the browser renders
  something different, Vue reports a hydration mismatch.
- **ISR:** Vercel caches a server-rendered page and serves the cached copy to every visitor.

## D1. The config key is `i18n`, and the module refuses to run next to `@nuxtjs/i18n`

**Choice:** options live under `i18n:` in `nuxt.config`. If `@nuxtjs/i18n` is also installed, setup
stops with an error that names the fix. Unknown options also stop setup, so a copied
`@nuxtjs/i18n` config cannot half-work.

**Why:** the key is familiar. Two modules cannot both decide the locale, and a silent merge would
produce wrong URLs that are hard to trace.

**Now:** unchanged. Ginko core installs ginko-i18n and passes `locales`, `defaultLocale` and
`baseUrl` from `ginko.config.ts`, so a Ginko site usually writes no `i18n:` block at all.

## D2. Messages use a subset of ICU MessageFormat, compiled at build time

**Choice:** arguments, `plural`, `selectordinal`, `select`, numbers and tags. The FormatJS parser
runs during the build. Browsers and Convex only read a small compiled tree (`src/core/messages.ts`).

**Why:** agents and translators already know ICU. MessageFormat 2 is a stable spec, but
`Intl.MessageFormat` is only a TC39 Stage 1 proposal, so browsers cannot run it yet. Compiling at
build time keeps the parser out of the browser bundle.

**Evidence:** `test/core.test.ts`.

## D3. The URL is the only source of the locale

**Choice:** the browser language never redirects a deep link and never changes the locale before
hydration. `useLocaleSuggestion()` offers the other language after the page is mounted. Only `/` with
`strategy: 'prefix'` redirects: on the server by cookie, then `Accept-Language`, then the default
(with `Vary`); on a static site by a small inline script.

**Why:** a link must show the same page to everyone who opens it, and to search engines. Detection
before hydration is the main cause of hydration mismatches in i18n modules.

**Now:** the URL is the only source of the locale on *public* pages. User-locale zones
(`userLocale: ['/app/**']`) take the locale from the user's setting instead: the `ginko_locale`
cookie, then `Accept-Language`, then the default, resolved once on the server and read from the
payload on the client (2026-10-11). That is not browser detection: the browser
never decides, and a zone page has no public URL per language for a crawler or a shared link to
disagree about. The hydration rule holds: server and client use the same value.

**Evidence:** 0 hydration warnings in more than 1,400 browser checks across Nuxt 4.6 and Nuxt 5,
server-rendered and static builds, and both strategies (old repository, `test/attack.mjs`).

**Now:** the suites live in `browser/` and CI runs them on every pull request that changes this
package. Run on 2026-10-12 (branch `release/i18n`, n4, n4c5 and n5 apps, server-rendered and
static, both strategies): `attack` 2,172/2,172, `zone-attack` 168/168, `edge-attack` 45/45,
`content-attack` 132/132 checks passed.

## D4. Two strategies: `prefix_except_default` and `prefix`

**Choice:** no domain-per-locale and no `no_prefix`.

**Why:** these two cover every multilingual Lupinum site. Each extra strategy multiplies the cases
the browser suites must check.

User-locale zones (D3) are not a third strategy: a zone is a set of paths inside either strategy that
has no locale in its URL, and the rest of the site keeps its strategy.

## D5. A missing translation falls back to the default locale, and says so

**Choice:** production shows the default-locale text, never a raw key or an empty string. The build
and the dev server warn per locale and list the keys (`en: 1 message(s) missing …`), and
`ginko-i18n check` fails CI with `missing`. A key that is missing in every locale renders as the key.

**Why:** a visitor should never see a broken page, and the team should never miss a gap.

## D6. Links to content come from content data, never from `localePath`

**Choice:** `localePath` translates the site's own app routes. Links to content (blog posts, menu
pages) come from the content itself, which already knows its URL in each locale.

**Why:** content can have a different slug per locale (`/blog/hallo` and `/en/blog/hello`).
`localePath` only adds a prefix, so it builds a link that does not exist.

**Evidence:** the English "Blog" link returned a 404 in the first test site
([research/content-contract.md](research/content-contract.md)).

**Now:** Ginko entries carry their URLs from the bundle, and `url` for the current locale, so sites
need no helper of their own for this.

## D7. Dynamic pages declare their other-language versions before rendering

**Choice:** `definePageMeta({ i18nAlternates: (to, { locale, localePath }) => … })`. The resolver runs
inside the Nuxt app context, in the router guard, and its result is stored in the payload, so
hydration and `_payload.json` reuse it. The key has the `i18n` prefix because page meta is one global
namespace for every module. It is not inside `i18n`: Nuxt extracts `i18n` at build time only while
it is plain data, so a function there would drop the page's `paths` and `locales`.

**Why:** the language switcher and the `hreflang` tags must be right in the first HTML. When the
alternates were computed during render instead, the switcher showed the previous page's links, the
HTML did not match after hydration, and some translated pages were never prerendered.

**Evidence:** that bug (#1) and the `NUXT_E1001` crash, both fixed and covered in the old suites.

## D8. Ginko libraries build on ginko-i18n

**Choice:** a library ships its own namespaced messages through the `ginko-i18n:sources` hook. The
site can override any single key.

**Why:** one message system replaces a catalogue and fallback logic per library.

**Now:** Ginko core installs ginko-i18n itself (`packages/ginko/src/nuxt/module.ts`), with the
locales from `ginko.config.ts`. There is one owner for the list of locales; step A (fix 6) removes the
remaining second copies.

## D9. No language model inside the library

**Choice:** the CLI (`ginko-i18n check`, `todo`, `apply`) gives an agent everything it needs to
translate. The library only validates and writes.

**Why:** no API keys, no running costs, and every change is a diff someone can review.

## D10. Never cache a response whose language came from a header or a cookie

**Choice:** cache only pages whose URL contains the locale. The module warns at build time when a
cache rule (`isr`, `swr`, `cache`) covers a path where the language is negotiated: `/api/**`,
excluded paths, and `/` with `strategy: 'prefix'`.

**Why:** Vercel ISR and Nitro SWR ignore `Vary`. The first visitor's language is then served to
everyone.

**Evidence:** [research/vercel-attack.md](research/vercel-attack.md) (Vercel preview deployments,
Nuxt 4 and 5, both strategies).

**Now:** Ginko core sets `isr: false` for the site's own server routes for the same reason.

## D11. Page paths stay ASCII

**Choice:** the module warns when a page path contains non-ASCII characters. Slugs are transliterated
(`grüße` → `gruesse`).

**Why:** under Vercel ISR, a non-ASCII path returned a 404, and Vercel cached that 404.

**Evidence:** root cause found on 2026-10-07: the SWR wrapper in nitropack 2.13.4 drops the decoded
path. The fix (nitrojs/nitro#4386) is merged on Nitro's v2 branch but not released.

**Change when:** a nitropack release with #4386 is the minimum version, and a Nuxt 5 build passes the
same Unicode check. Then relax the warning.

## D12. Server components get the locale explicitly

**Choice:** pass `:locale="locale"` to a server component. A bare `<NuxtIsland>` needs
`:context="{ url: route.path }"`.

**Why:** Nuxt sends the page URL only for island pages. Without it, a server component cannot know
the locale and renders the default language.

## D13. Sitemap alternates are explicit, never guessed from prefixes

**Choice:** every sitemap URL lists its other-language versions (plus `x-default`) from data, not by
stripping prefixes.

**Why:** `@nuxtjs/sitemap` with `autoI18n` pairs `/en/about` with `/about` by removing the prefix.
That is wrong for translated slugs.

**Evidence:** the sitemap checks in the old `test/edge-attack.mjs`;
[research/sitemap-no-issue.md](research/sitemap-no-issue.md).

**Now:** Ginko core serves its own `/sitemap.xml` from the bundle, with the same explicit alternates.
ginko-i18n still turns `autoI18n` off and attaches alternates through the `sitemap:input` hook when a
site installs `@nuxtjs/sitemap` instead, and Ginko's own route steps aside then (2026-10-12). Those
alternates cover static pages only: pages with a dynamic segment need the site's own sitemap source.

## D14. Release through the monorepo

**Old choice:** adopt the Lupinum library standard in the standalone repository (build to `dist`,
Changesets, ESLint, CI), but leave out the release workflows while the repository is private.

**Now:** replaced. The package builds and releases with the other Ginko packages through the
monorepo's Changesets setup (RELEASING.md).

## D15. Nuxt 4.6 to Nuxt 5 in one release (new, 2026-10-11)

**Choice:** one package version supports Nuxt 4.6 and Nuxt 5. Server code imports only from
`nuxt/server`, never from `h3` or `#imports`. Nitro plugins register through `addNitroPlugin` with
separate `nitro2` and `nitro3` files where they need Nitro APIs. The browser suites build test apps
on Nuxt 4.6.0 (`n4`, `n4c5` with Nuxt 5 compatibility) and a pinned Nuxt 5 nightly (`n5`); CI runs
them for pull requests that change this package. Until Nuxt 5 is released, the peer range is
`^4.6.0` only.

**Why:** Nuxt 5 is planned for Q4 2026 and is not released yet (npm `latest` is 4.6.1 on
2026-10-11). Nuxt 4.6 is the first version whose `nuxt/server` API runs unchanged on Nuxt 5, so a
site can upgrade Nuxt without upgrading Ginko.

**Evidence:** the old repository already ran its suites on `n4`, `n4c5` and `n5` apps
([research/platform-nuxt5.md](research/platform-nuxt5.md)).

**Change when:** Nuxt 5 is released. Ship 1.0 as "Nuxt 4.6 to 5" only after the Nuxt 5 job is green
on the release, not only on a nightly.
