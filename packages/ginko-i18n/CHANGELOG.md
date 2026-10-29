# @lupinum/ginko-i18n

## 0.12.0

No changes in this release.

## 0.11.0

No changes in this release.

## 0.10.1

No changes in this release.

## 0.10.0

No changes in this release.

## 0.9.0

No changes in this release.

## 0.8.0

No changes in this release.

## 0.7.0

No changes in this release.

## 0.6.7

No changes in this release.

## 0.6.6

No changes in this release.

## 0.6.5

No changes in this release.

## 0.6.4

No changes in this release.

## 0.6.3

No changes in this release.

## 0.6.2

No changes in this release.

## 0.6.1

No changes in this release.

## 0.6.0

No changes in this release.

## 0.5.0

### Patch Changes

- [#21](https://github.com/lupinum-dev/ginko/pull/21) [`80f93a4`](https://github.com/lupinum-dev/ginko/commit/80f93a4f6bd171e1146b929913254039becdd991) Thanks [@Mat4m0](https://github.com/Mat4m0)! - Add the `dateLanguage` option to `createFormatters` and `createTranslator`: dates in another tag (`en-GB`) while numbers and words stay in `language`.

- [#21](https://github.com/lupinum-dev/ginko/pull/21) [`80f93a4`](https://github.com/lupinum-dev/ginko/commit/80f93a4f6bd171e1146b929913254039becdd991) Thanks [@Mat4m0](https://github.com/Mat4m0)! - Fix `//blog` on Nuxt 4: a doubled leading slash now answers with a 301 to `/blog` there too, instead of showing the home page.

- [#21](https://github.com/lupinum-dev/ginko/pull/21) [`80f93a4`](https://github.com/lupinum-dev/ginko/commit/80f93a4f6bd171e1146b929913254039becdd991) Thanks [@Mat4m0](https://github.com/Mat4m0)! - Fix error pages: they get no canonical or hreflang and are noindex.

- [#21](https://github.com/lupinum-dev/ginko/pull/21) [`80f93a4`](https://github.com/lupinum-dev/ginko/commit/80f93a4f6bd171e1146b929913254039becdd991) Thanks [@Mat4m0](https://github.com/Mat4m0)! - Fix page addresses in another case: `/Blog` now answers with a 301 to `/blog`, and the canonical link uses that spelling.

- [#21](https://github.com/lupinum-dev/ginko/pull/21) [`80f93a4`](https://github.com/lupinum-dev/ginko/commit/80f93a4f6bd171e1146b929913254039becdd991) Thanks [@Mat4m0](https://github.com/Mat4m0)! - Fix doubled and trailing slashes: `//blog` and `/blog/` now answer with a 301 to `/blog`, so every page has one URL.

- [#21](https://github.com/lupinum-dev/ginko/pull/21) [`80f93a4`](https://github.com/lupinum-dev/ginko/commit/80f93a4f6bd171e1146b929913254039becdd991) Thanks [@Mat4m0](https://github.com/Mat4m0)! - Change dates in user-locale zones to follow the region of the browser's first language when it is the same language and the locale names no region (`en` reads 25/10/2026 in an en-GB browser); numbers and words stay in the locale's language.

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
