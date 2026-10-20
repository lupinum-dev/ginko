# @lupinum/ginko-preset-gastro

## 0.6.2

### Patch Changes

- Updated dependencies [[`d082b85`](https://github.com/lupinum-dev/ginko/commit/d082b856851dabbf1d02d06d2d5796c50a3f825d)]:
  - @lupinum/ginko@0.6.2

## 0.6.1

### Patch Changes

- Updated dependencies [[`f13ccdb`](https://github.com/lupinum-dev/ginko/commit/f13ccdbeeb6bc9eb84162ba25ceeacfe0fb3267e)]:
  - @lupinum/ginko@0.6.1

## 0.6.0

### Patch Changes

- Updated dependencies [[`ee8c8a9`](https://github.com/lupinum-dev/ginko/commit/ee8c8a982a64ee15a1cab906b7a3b58fe8c686e6)]:
  - @lupinum/ginko@0.6.0

## 0.5.0

### Minor Changes

- [#21](https://github.com/lupinum-dev/ginko/pull/21) [`80f93a4`](https://github.com/lupinum-dev/ginko/commit/80f93a4f6bd171e1146b929913254039becdd991) Thanks [@Mat4m0](https://github.com/Mat4m0)! - Add country and sessions to @lupinum/ginko/basics; move hours, notices, events and gallery into basics (preset-gastro re-exports them unchanged).

- [#21](https://github.com/lupinum-dev/ginko/pull/21) [`80f93a4`](https://github.com/lupinum-dev/ginko/commit/80f93a4f6bd171e1146b929913254039becdd991) Thanks [@Mat4m0](https://github.com/Mat4m0)! - Add `fields` to create tasks: the task asks and writes only those fields.

- [#23](https://github.com/lupinum-dev/ginko/pull/23) [`7b165c2`](https://github.com/lupinum-dev/ginko/commit/7b165c25e17ed2f4fb50e8054febf618a6af10d7) Thanks [@Mat4m0](https://github.com/Mat4m0)! - Change lunch and menu allergens to be asked again when the dish changes.

- [#21](https://github.com/lupinum-dev/ginko/pull/21) [`80f93a4`](https://github.com/lupinum-dev/ginko/commit/80f93a4f6bd171e1146b929913254039becdd991) Thanks [@Mat4m0](https://github.com/Mat4m0)! - Add availability to the menu and events: a dish can be taken off the menu ("Auf der Karte") or marked sold out for one day (quick task "Gericht heute aus"), an event can be marked fully booked (quick task "Veranstaltung ausgebucht"). `dishOn(dish, date)` gives the rule for the site, and `eventJsonLd` takes `soldOut`.

- [#21](https://github.com/lupinum-dev/ginko/pull/21) [`80f93a4`](https://github.com/lupinum-dev/ginko/commit/80f93a4f6bd171e1146b929913254039becdd991) Thanks [@Mat4m0](https://github.com/Mat4m0)! - Change "Heute geschlossen" to work for any single day: the field is now labelled "Geschlossen am" with hints, and `upcomingClosures` lists a `closedOn` day after today, so the site announces tomorrow's closure. Each owner closure it returns has `field`, the bundle path of its reason. `closedOnClosure(hours, today)` gives that day alone, for a list without the days limit.

- [#21](https://github.com/lupinum-dev/ginko/pull/21) [`80f93a4`](https://github.com/lupinum-dev/ginko/commit/80f93a4f6bd171e1146b929913254039becdd991) Thanks [@Mat4m0](https://github.com/Mat4m0)! - Add `menuCategories` and the `MenuCategory` type: the categories of `menu()` in menu order, so a site groups its dishes by the brick's own list (templates/_features/menu/app/composables/useMenu.ts).

- [#21](https://github.com/lupinum-dev/ginko/pull/21) [`80f93a4`](https://github.com/lupinum-dev/ginko/commit/80f93a4f6bd171e1146b929913254039becdd991) Thanks [@Mat4m0](https://github.com/Mat4m0)! - Add `noticesOn(notices, ctx, today)`: on a day the owner closed, it leaves out a notice that ends today, so "Fully booked today" no longer shows under "Closed today".

- [#21](https://github.com/lupinum-dev/ginko/pull/21) [`80f93a4`](https://github.com/lupinum-dev/ginko/commit/80f93a4f6bd171e1146b929913254039becdd991) Thanks [@Mat4m0](https://github.com/Mat4m0)! - Add `ends` to what `upcomingPlans` returns: the last day of a coming plan when it has one (a yearly season over New Year ends in the next year), so a site can show "1. November – 31. März: Winterzeiten" instead of the start only. The README now shows `hourPlans` and `lunchPlans` right after the bricks they plan.

- [#21](https://github.com/lupinum-dev/ginko/pull/21) [`80f93a4`](https://github.com/lupinum-dev/ginko/commit/80f93a4f6bd171e1146b929913254039becdd991) Thanks [@Mat4m0](https://github.com/Mat4m0)! - Change `menu()`: "Preis ändern" now shows the planned price and its date, and the task "Preis ab …" (`menu.priceFrom`) is gone. Staff who only had "Preis ab …" need "Preis ändern" granted again; "Gericht hinzufügen" no longer asks for a planned price.

- [#21](https://github.com/lupinum-dev/ginko/pull/21) [`80f93a4`](https://github.com/lupinum-dev/ginko/commit/80f93a4f6bd171e1146b929913254039becdd991) Thanks [@Mat4m0](https://github.com/Mat4m0)! - Add `hours({ plans: 'hourPlans' })`: the hours name their hour plans in the stored schema (`status: { hours: { plans } }`), the release check refuses a key that is not a collection of hour plans, and the Studio's line for today reads only those plans.

- [#21](https://github.com/lupinum-dev/ginko/pull/21) [`80f93a4`](https://github.com/lupinum-dev/ginko/commit/80f93a4f6bd171e1146b929913254039becdd991) Thanks [@Mat4m0](https://github.com/Mat4m0)! - Add today's opening hours to the Studio's Today page: `hours()` declares `status: { hours: true }`.

- [#21](https://github.com/lupinum-dev/ginko/pull/21) [`80f93a4`](https://github.com/lupinum-dev/ginko/commit/80f93a4f6bd171e1146b929913254039becdd991) Thanks [@Mat4m0](https://github.com/Mat4m0)! - Add `after` to time fields (an end time must be later than its start) and `timeZone` to the gastro `eventJsonLd`, which then writes the start with the site's offset.

### Patch Changes

- [#21](https://github.com/lupinum-dev/ginko/pull/21) [`80f93a4`](https://github.com/lupinum-dev/ginko/commit/80f93a4f6bd171e1146b929913254039becdd991) Thanks [@Mat4m0](https://github.com/Mat4m0)! - Change the "Betriebsurlaub und Ausnahmen" task to also show how many days ahead the website announces a closure ("Schließungen ankündigen (Tage vorher)", with a hint), so the owner learns when guests first see it.

- [#21](https://github.com/lupinum-dev/ginko/pull/21) [`80f93a4`](https://github.com/lupinum-dev/ginko/commit/80f93a4f6bd171e1146b929913254039becdd991) Thanks [@Mat4m0](https://github.com/Mat4m0)! - Add a hint to the reason of a closure or exception: keep it short, because the website shows it as written.

- [#21](https://github.com/lupinum-dev/ginko/pull/21) [`80f93a4`](https://github.com/lupinum-dev/ginko/commit/80f93a4f6bd171e1146b929913254039becdd991) Thanks [@Mat4m0](https://github.com/Mat4m0)! - Change the public holiday setting to explain itself: a hint says it covers every public holiday, that "wie am Sonntag" takes the Sunday hours of that day, and that a single holiday gets other hours as an exception. The option "normal" now reads "normale Zeiten des Wochentags".

- [#23](https://github.com/lupinum-dev/ginko/pull/23) [`7b165c2`](https://github.com/lupinum-dev/ginko/commit/7b165c25e17ed2f4fb50e8054febf618a6af10d7) Thanks [@Mat4m0](https://github.com/Mat4m0)! - Add `isLunchPlaceholder`, which tells a lunch day that still holds the placeholder dish of a fresh site, so a site can leave out its allergen line.

- [#21](https://github.com/lupinum-dev/ginko/pull/21) [`80f93a4`](https://github.com/lupinum-dev/ginko/commit/80f93a4f6bd171e1146b929913254039becdd991) Thanks [@Mat4m0](https://github.com/Mat4m0)! - Change the labels of the two opening times of a day from "Mittag/Abend von/bis" to "Öffnet um", "Schließt um", "Öffnet wieder um" and "Schließt wieder um", so winter hours in the first period no longer read as lunch. The stored field names stay.

- [#21](https://github.com/lupinum-dev/ginko/pull/21) [`80f93a4`](https://github.com/lupinum-dev/ginko/commit/80f93a4f6bd171e1146b929913254039becdd991) Thanks [@Mat4m0](https://github.com/Mat4m0)! - Add a hint to a notice's "Gilt bis": leave it empty to keep the notice until you remove it.

- [#21](https://github.com/lupinum-dev/ginko/pull/21) [`80f93a4`](https://github.com/lupinum-dev/ginko/commit/80f93a4f6bd171e1146b929913254039becdd991) Thanks [@Mat4m0](https://github.com/Mat4m0)! - Change three Studio labels of the gastro preset: the menu category “Desserts” is “Nachspeisen” in German, the hour plans are “Öffnungszeiten ab Datum” (“Opening hours from a date”), and the English holiday task reads “Holiday closures and exceptions” like its field.

- [#23](https://github.com/lupinum-dev/ginko/pull/23) [`7b165c2`](https://github.com/lupinum-dev/ginko/commit/7b165c25e17ed2f4fb50e8054febf618a6af10d7) Thanks [@Mat4m0](https://github.com/Mat4m0)! - Change `upcomingClosures` and `upcomingHolidayClosures` to leave out a public holiday that falls on a day the week already closes.
- Updated dependencies [[`80f93a4`](https://github.com/lupinum-dev/ginko/commit/80f93a4f6bd171e1146b929913254039becdd991), [`80f93a4`](https://github.com/lupinum-dev/ginko/commit/80f93a4f6bd171e1146b929913254039becdd991), [`80f93a4`](https://github.com/lupinum-dev/ginko/commit/80f93a4f6bd171e1146b929913254039becdd991), [`80f93a4`](https://github.com/lupinum-dev/ginko/commit/80f93a4f6bd171e1146b929913254039becdd991), [`80f93a4`](https://github.com/lupinum-dev/ginko/commit/80f93a4f6bd171e1146b929913254039becdd991), [`80f93a4`](https://github.com/lupinum-dev/ginko/commit/80f93a4f6bd171e1146b929913254039becdd991), [`80f93a4`](https://github.com/lupinum-dev/ginko/commit/80f93a4f6bd171e1146b929913254039becdd991), [`7b165c2`](https://github.com/lupinum-dev/ginko/commit/7b165c25e17ed2f4fb50e8054febf618a6af10d7), [`7b165c2`](https://github.com/lupinum-dev/ginko/commit/7b165c25e17ed2f4fb50e8054febf618a6af10d7), [`80f93a4`](https://github.com/lupinum-dev/ginko/commit/80f93a4f6bd171e1146b929913254039becdd991), [`80f93a4`](https://github.com/lupinum-dev/ginko/commit/80f93a4f6bd171e1146b929913254039becdd991), [`80f93a4`](https://github.com/lupinum-dev/ginko/commit/80f93a4f6bd171e1146b929913254039becdd991), [`80f93a4`](https://github.com/lupinum-dev/ginko/commit/80f93a4f6bd171e1146b929913254039becdd991), [`80f93a4`](https://github.com/lupinum-dev/ginko/commit/80f93a4f6bd171e1146b929913254039becdd991), [`80f93a4`](https://github.com/lupinum-dev/ginko/commit/80f93a4f6bd171e1146b929913254039becdd991), [`80f93a4`](https://github.com/lupinum-dev/ginko/commit/80f93a4f6bd171e1146b929913254039becdd991), [`80f93a4`](https://github.com/lupinum-dev/ginko/commit/80f93a4f6bd171e1146b929913254039becdd991), [`80f93a4`](https://github.com/lupinum-dev/ginko/commit/80f93a4f6bd171e1146b929913254039becdd991), [`80f93a4`](https://github.com/lupinum-dev/ginko/commit/80f93a4f6bd171e1146b929913254039becdd991), [`7b165c2`](https://github.com/lupinum-dev/ginko/commit/7b165c25e17ed2f4fb50e8054febf618a6af10d7), [`7b165c2`](https://github.com/lupinum-dev/ginko/commit/7b165c25e17ed2f4fb50e8054febf618a6af10d7), [`80f93a4`](https://github.com/lupinum-dev/ginko/commit/80f93a4f6bd171e1146b929913254039becdd991), [`80f93a4`](https://github.com/lupinum-dev/ginko/commit/80f93a4f6bd171e1146b929913254039becdd991), [`80f93a4`](https://github.com/lupinum-dev/ginko/commit/80f93a4f6bd171e1146b929913254039becdd991), [`7b165c2`](https://github.com/lupinum-dev/ginko/commit/7b165c25e17ed2f4fb50e8054febf618a6af10d7), [`7b165c2`](https://github.com/lupinum-dev/ginko/commit/7b165c25e17ed2f4fb50e8054febf618a6af10d7), [`80f93a4`](https://github.com/lupinum-dev/ginko/commit/80f93a4f6bd171e1146b929913254039becdd991), [`80f93a4`](https://github.com/lupinum-dev/ginko/commit/80f93a4f6bd171e1146b929913254039becdd991), [`80f93a4`](https://github.com/lupinum-dev/ginko/commit/80f93a4f6bd171e1146b929913254039becdd991), [`80f93a4`](https://github.com/lupinum-dev/ginko/commit/80f93a4f6bd171e1146b929913254039becdd991), [`80f93a4`](https://github.com/lupinum-dev/ginko/commit/80f93a4f6bd171e1146b929913254039becdd991), [`80f93a4`](https://github.com/lupinum-dev/ginko/commit/80f93a4f6bd171e1146b929913254039becdd991), [`80f93a4`](https://github.com/lupinum-dev/ginko/commit/80f93a4f6bd171e1146b929913254039becdd991), [`80f93a4`](https://github.com/lupinum-dev/ginko/commit/80f93a4f6bd171e1146b929913254039becdd991), [`80f93a4`](https://github.com/lupinum-dev/ginko/commit/80f93a4f6bd171e1146b929913254039becdd991), [`80f93a4`](https://github.com/lupinum-dev/ginko/commit/80f93a4f6bd171e1146b929913254039becdd991), [`80f93a4`](https://github.com/lupinum-dev/ginko/commit/80f93a4f6bd171e1146b929913254039becdd991), [`80f93a4`](https://github.com/lupinum-dev/ginko/commit/80f93a4f6bd171e1146b929913254039becdd991), [`80f93a4`](https://github.com/lupinum-dev/ginko/commit/80f93a4f6bd171e1146b929913254039becdd991), [`80f93a4`](https://github.com/lupinum-dev/ginko/commit/80f93a4f6bd171e1146b929913254039becdd991), [`7b165c2`](https://github.com/lupinum-dev/ginko/commit/7b165c25e17ed2f4fb50e8054febf618a6af10d7), [`7b165c2`](https://github.com/lupinum-dev/ginko/commit/7b165c25e17ed2f4fb50e8054febf618a6af10d7), [`80f93a4`](https://github.com/lupinum-dev/ginko/commit/80f93a4f6bd171e1146b929913254039becdd991), [`80f93a4`](https://github.com/lupinum-dev/ginko/commit/80f93a4f6bd171e1146b929913254039becdd991), [`80f93a4`](https://github.com/lupinum-dev/ginko/commit/80f93a4f6bd171e1146b929913254039becdd991), [`80f93a4`](https://github.com/lupinum-dev/ginko/commit/80f93a4f6bd171e1146b929913254039becdd991), [`80f93a4`](https://github.com/lupinum-dev/ginko/commit/80f93a4f6bd171e1146b929913254039becdd991), [`80f93a4`](https://github.com/lupinum-dev/ginko/commit/80f93a4f6bd171e1146b929913254039becdd991), [`c28d1e3`](https://github.com/lupinum-dev/ginko/commit/c28d1e3e4ba1e558f8c71d7b69961f7474a221d1), [`80f93a4`](https://github.com/lupinum-dev/ginko/commit/80f93a4f6bd171e1146b929913254039becdd991), [`80f93a4`](https://github.com/lupinum-dev/ginko/commit/80f93a4f6bd171e1146b929913254039becdd991), [`7b165c2`](https://github.com/lupinum-dev/ginko/commit/7b165c25e17ed2f4fb50e8054febf618a6af10d7), [`80f93a4`](https://github.com/lupinum-dev/ginko/commit/80f93a4f6bd171e1146b929913254039becdd991), [`80f93a4`](https://github.com/lupinum-dev/ginko/commit/80f93a4f6bd171e1146b929913254039becdd991), [`7b165c2`](https://github.com/lupinum-dev/ginko/commit/7b165c25e17ed2f4fb50e8054febf618a6af10d7), [`80f93a4`](https://github.com/lupinum-dev/ginko/commit/80f93a4f6bd171e1146b929913254039becdd991), [`80f93a4`](https://github.com/lupinum-dev/ginko/commit/80f93a4f6bd171e1146b929913254039becdd991), [`80f93a4`](https://github.com/lupinum-dev/ginko/commit/80f93a4f6bd171e1146b929913254039becdd991), [`80f93a4`](https://github.com/lupinum-dev/ginko/commit/80f93a4f6bd171e1146b929913254039becdd991), [`80f93a4`](https://github.com/lupinum-dev/ginko/commit/80f93a4f6bd171e1146b929913254039becdd991), [`80f93a4`](https://github.com/lupinum-dev/ginko/commit/80f93a4f6bd171e1146b929913254039becdd991), [`80f93a4`](https://github.com/lupinum-dev/ginko/commit/80f93a4f6bd171e1146b929913254039becdd991), [`80f93a4`](https://github.com/lupinum-dev/ginko/commit/80f93a4f6bd171e1146b929913254039becdd991), [`80f93a4`](https://github.com/lupinum-dev/ginko/commit/80f93a4f6bd171e1146b929913254039becdd991), [`80f93a4`](https://github.com/lupinum-dev/ginko/commit/80f93a4f6bd171e1146b929913254039becdd991), [`80f93a4`](https://github.com/lupinum-dev/ginko/commit/80f93a4f6bd171e1146b929913254039becdd991), [`80f93a4`](https://github.com/lupinum-dev/ginko/commit/80f93a4f6bd171e1146b929913254039becdd991), [`80f93a4`](https://github.com/lupinum-dev/ginko/commit/80f93a4f6bd171e1146b929913254039becdd991), [`80f93a4`](https://github.com/lupinum-dev/ginko/commit/80f93a4f6bd171e1146b929913254039becdd991)]:
  - @lupinum/ginko@0.5.0

## 0.4.0

### Minor Changes

- [`ea2ea13`](https://github.com/lupinum-dev/ginko/commit/ea2ea133997f2011ad0d43f77a0f1dc75605923e) Thanks [@Mat4m0](https://github.com/Mat4m0)! - Add Ginko 0.4, the first release: one content system for Nuxt websites, from Markdown files in Git to a hosted platform.
  
  Owners, staff and AI agents edit the same content. All seven packages release together under one version. It starts at 0.4 because `@lupinum/ginko-content` and `@lupinum/ginko-docs` already published an older, unrelated line up to 0.3. Until 1.0, a minor version (0.4 → 0.5) may contain breaking changes; the changelog names each one and how to update.
  
  Requirements: Node 22.18+, 24 or 26, and Nuxt 4.6+ or Nuxt 5 (tested on its nightly until it is released). Start a site with `npm create ginko@latest my-site`; the documentation explains every step.
  
  **Public API**
  
  - `@lupinum/ginko`: `defineSite`, `single`, `collection`, `f`, `defineComponents`, `formatMoney`, `plainText`, `safeHref`, `startOfWeek` and the documented types. Imported, not auto-imported.
  - `@lupinum/ginko/nuxt`: the module, the `useGinko*` composables (everything that needs a Nuxt app starts with `useGinko`), `<GinkoMarkdown>` and `<GinkoImage>`. `@lupinum/ginko/vue`: `<GinkoMarkdown>` for any Vue app. `@lupinum/ginko/search`: `loadIndex` and `search`.
  - `@lupinum/ginko/internal` and `@lupinum/ginko/internal/search` are for Ginko's own packages and have no stability promise.
  - The `ginko` CLI: `check [--offline]`, `release` and `export [folder]`, plus `--version`. Every command run prints one JSON line, `{ "ok": true, … }` or `{ "ok": false, "error": { code, message } }` (`--help` and `--version` print plain text), and ends with exit code 0 (ok), 1 (fix the code), 2 (usage), 3 (platform unreachable, retry) or 4 (key not allowed). CI deploys the site only when `release` prints `"deploy": true` (a superseded run exits 0 with `"deploy": false`). The CLI reads `GINKO_PLATFORM` (or `NUXT_PUBLIC_GINKO_PLATFORM`), `GINKO_KEY`, `GINKO_COMMIT` (or `GITHUB_SHA`), `GINKO_BRANCH` and `GINKO_REMOTE`; it does not read `.env` files. `ginko-i18n --json` uses the same output shape, error codes (`USAGE`, `INVALID`) and exit codes.
  - Config names: `f.ref` (one entry) and `f.refs` (several); `visible: { mode: 'until', field, days?, deleteExpired? }`; prefill tokens `@today`, `@workWeek`, `@nextWorkWeek`; `firstDayOfWeek`, `linkCheck`, `untranslated`, `maxBytes`, `Migration.compute`, `retired` rule `{ drop: true }`. Options and defaults are typed per field, and an unknown top-level key fails the build.
  - Markdown components: `embed`, `frame` (`none`, `card`, `border`, …), `background` (`none`, `muted`, `tint`), `appearance` (`quiet`, `tint`), `quiz-question{mode}`, `code-tree{file}`.
  
  **Content (`@lupinum/ginko`, `@lupinum/ginko-content`)**
  
  - One text format: Markdown (comark 0.7) everywhere, with field profiles that limit what a field may contain. Footnotes, emoji, alerts, Shiki code, task lists, route links (`$blog.my-post`), reusable snippets and heading anchors.
  - Data files: YAML and JSON (one file, one entry) and CSV (one file, many entries), checked against the field schema; every error names the file and field, and the line for CSV rows and unreadable files. Entries with `draft: true` stay out of production builds.
  - Query engine in the site, over the loaded bundle: `where`, `order`, `limit`, pagination with totals, field selection, `include` for references, previous/next and facet counts.
  - References (`f.ref`, `f.refs`), navigation trees and breadcrumbs, and a URL for every entry in every language; two entries on one URL fail the build.
  - Link check before any HTML exists: route links, anchors, snippets and redirected paths, in the build, the dev terminal, `ginko check` and the agent tools. On the platform a save, a new entry or a scheduled publish that adds a broken link is stopped, and History says why. External links are checked on request (`linkCheck.external`), at build and in `ginko check` (never in dev), with a 7-day cache.
  - Images: WebP copies at 480, 960 and 1600 px, made at upload on the platform and at build for files. `<GinkoImage>` and Markdown images get `srcset` and `sizes`.
  - Redirects from `redirectFrom` (301) and site rules in `redirects` (301 by default, `status` 302/307/308 per rule).
  - SEO from the bundle, with no other module: title template, canonical, Open Graph with `og:url`, `<html lang>`, hreflang with `x-default`, sitemap with `lastmod`, images and alternates, robots.txt with `noindex` on preview hosts, JSON-LD. With `nuxt-og-image` (in every starter), every page gets a generated share card in the brand colour `seo.color`, with the site's logo and the page's image.
  - Works with the Nuxt SEO modules (`@nuxtjs/seo` or single ones, in any order): Ginko leaves them sitemap, robots.txt and JSON-LD defaults and hands them its pages with hreflang, the site's address, name and languages, and `noindex` on preview hosts. `nuxt-ai-ready` stays off while Ginko serves `/llms.txt`. Requires `nuxt-og-image` 7.
  - Search index built in plain JS at build time, one record per heading section, loaded lazily per language.
  - Agent output: `/llms.txt`, `/llms-full.txt`, a `.md` twin for every entry page (collections with a `route`), and a Markdown 404 that suggests pages. The normal address always answers with HTML.
  - Render modes: Git-only sites prerender everything; platform sites refresh changed pages after a publish; previews render with `noindex`.
  - In dev, `nuxt dev` restarts when `ginko.config.ts` changes, and a brick that cannot reach the platform names itself and the fix.
  - CLI `ginko`: `check` (schema, links and the share image, for every site; `--offline` without the platform) and `release` for CI, `export` for backups; `pnpm local:dev|import|pull` run only in the Ginko monorepo.
  
  **Languages (`@lupinum/ginko-i18n`)**
  
  - The only locale authority: routes, alternates, hreflang, messages with plurals, and formatters for dates, ranges, relative time, numbers, currency and lists, each in the site's time zone.
  - Works on its own in any Nuxt 4.6+ or Nuxt 5 app, without the rest of Ginko.
  
  **Components and docs (`@lupinum/ginko-components`, `@lupinum/ginko-docs`)**
  
  - Content components with props defined as Ginko fields: callouts, tabs, code groups, steps, cards, accordion, figures, embeds (click to load), timeline, quiz and more. Each one can also be copied into an app with the shadcn-vue CLI, from a registry the docs build generates.
  - Docs layer (`@lupinum/ginko-docs`; `npm create ginko@latest my-docs -- --preset docs` starts a site with it): navigation, section tabs, breadcrumbs, table of contents with scroll spy, previous/next, ⌘K search with heading results, blog with authors and RSS, changelog, copy page as Markdown, dark mode. A guide for switching from Nuxt Content and `@nuxtjs/i18n`. Math (KaTeX) and mermaid diagrams render and load only on pages that use them.
  
  **Platform and Studio (hosted by Lupinum)**
  
  The platform is a hosted service, not an npm package. A site connects to it with one setting; without it, the site reads its content from files.
  
  - Quick tasks for the jobs owners do most ("Heute geschlossen", "Preis ändern"), phone first, with the full form behind "Alles bearbeiten".
  - Files library: All, Recent, Unused, Missing alt text, Duplicates and folders; icon and list views; "used in" with links; replace a file and keep its references; a used file cannot be removed by mistake. Alt text set in the library is the default for every use, per language.
  - Approvals, off by default: a task or agent key can need a yes. Reviewers see the change, approve, approve for a time, or reject with a sentence; the author sees the reason. Releases publish several changes together.
  - History with "show changes", "back to this version" and undo; drafts and scheduled publishing; trash with restore; translation status per language; "why is this not on the website?".
  - Team and invitations with per-task rights, sign-in with an emailed code, AI agent keys with an MCP tool catalog derived from the operations, and weekly reminder mails.
  - Long forms group their fields under headings or in tabs (`group` on a field, `layout: 'tabs'` on a brick); phones always show headings.
  - A rich text editor (TipTap 3) that writes Markdown, where untouched text stays byte for byte. Headings, lists, task lists, quotes, code blocks, tables, images from the library, embeds, registry components with prop forms, slash and bubble menus, Markdown shortcuts and paste, source mode, find and replace (⌘F), a drag handle and Alt+↑/↓ to move blocks, character counter, a link card for pasted URLs, uploads with progress, and a formatting bar above the phone keyboard.
  - Delete a site, with seven days to cancel, and delete your own account. The last owner of a site must hand it over or delete it first.
  - Studio in German, English and Spanish (beta), light and dark.
  
  **Presets (`@lupinum/ginko-preset-gastro`, `create-ginko`)**
  
  - Gastro: opening hours with exceptions, seasons, holidays and new hours from a date; lunch week with planning ahead and an optional PDF; menu with prices from a date; notices that expire; events; JSON-LD for Restaurant, Menu, opening hours and Event; a printable lunch sheet.
  - `create-ginko` starts a new site, plain or with `--preset gastro|docs`. Starters install with npm, pnpm 11 and bun, carry a `typecheck` script, a page description and share cards (`nuxt-og-image` with Takumi, Nuxt 4.6.1 or later; set `NUXT_APP_SECRET` where the site runs, `.env` has one), and create-ginko warns on an unsupported Node.
  
  **Not in 0.4**
  
  Real-time co-editing comes next. Also not included: an agency preset, the editor UI as a shadcn-vue registry, OAuth for agent connectors, and a Google Business sync.

### Patch Changes

- Updated dependencies [[`ea2ea13`](https://github.com/lupinum-dev/ginko/commit/ea2ea133997f2011ad0d43f77a0f1dc75605923e)]:
  - @lupinum/ginko@0.4.0
