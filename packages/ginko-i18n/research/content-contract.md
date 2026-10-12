# Contract spike: ginko-content under ginko-i18n (2026-10-07)

`apps/content` runs `@lupinum/ginko-content` from npm, unchanged (spike on `1.0.0-beta.9`, rerun on `1.0.0-beta.11`
with the same result), under the skeleton
module. Collection `blog` with translated slugs (`1.hallo-welt` ↔ `1.hello-world`, `3.grüße` ↔
`3.greetings`) and a German-only post. Attacks: `test/content-attack.mjs`, built by
`scripts/build-content.sh` (SSR and static × both strategies). Evidence: `.evidence/content-attack.log`.

Note (2026-10-11): that app and script lived in the old `ginko-i18n` repo and are not in this monorepo. Here,
`browser/content-attack.mjs` ports the suite to the `n4` targets of `browser/build-all.sh`, with posts from the
fixture's own API (`fixtures/site/pages/blog`) instead of `@lupinum/ginko-content`. It covers the ginko-i18n side
(translated slugs, hreflang, 404s, client navigation, per-locale list), not the content module's own behaviour; the
results below are from the original spike.

## Result

| Strategy | Result |
| --- | --- |
| `prefix_except_default` | All checks pass, SSR and static: server HTML switcher and hreflang use translated slugs, untranslated post links to `/en` with no hreflang, hydration clean, content and ginko-i18n agree on the locale, client navigation on a static host gets alternates from `_payload.json`, English list links only English posts, server navigation takes its locale from `getI18n(event)`. |
| `prefix` | 16 failures, one cause: content projects default-locale routes without a prefix (`/blog/hallo-welt`), so `/de/blog/hallo-welt` is a 404 and the English page's alternates point to `/blog/hallo-welt`. |

## Findings

1. **Content hard-codes the prefix rule (proven).** `prefix_except_default` works only because content's
   rule happens to match. Contract: content takes `localizePath` / `stripLocale` and the strategy
   from ginko-i18n. This is meeting point 1 of the alignment plan.
2. **Second language list (proven).** Without `@nuxtjs/i18n`, content needs `content.i18n.locales` and
   `defaultLocale` repeated next to `i18n.locales`. Nothing checks that the two agree. Contract: content
   reads them from ginko-i18n (build-time hook, runtime composable); `content.i18n` keeps only fallback
   and slug policy.
3. **Content's locale detection works by luck.** It falls back to the first path segment because
   `$i18n` and `$si18n` are absent. That matches ginko-i18n's rule for both strategies today, but it is a
   third copy of the rule. Contract: content reads the current locale from ginko-i18n.
4. **`contentAlternates` needs nothing new from content.** Built in 10 lines on the public
   `resolveOne(collection, { by: { route }, locale })` → `doc.route.alternates` (only `source: 'variant'`).
   Content can ship it as is.
5. **Resolvers need the Nuxt context (ginko-i18n bug, fixed).** The router guard called the resolver
   outside the app context, so content queries threw `NUXT_E1001`. Now wrapped in
   `nuxtApp.runWithContext`. Regression covered by this spike.
6. **Server queries take the event; the locale is still explicit.** `navigation(event, blog, { locale })`
   works with `getI18n(event).locale`. Contract idea: when ginko-i18n is installed, content's server
   queries default `locale` to `event.context.locale` (still overridable), so route-less code passes it
   explicitly as ADR-0007 asks, and request code does not repeat it.
7. **Umlaut slugs are transliterated** (`grüße` → `gruesse`). Works in both locales; worth a sentence
   in content docs, not a contract change.
