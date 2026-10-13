---
"@lupinum/ginko": minor
"@lupinum/ginko-i18n": minor
"@lupinum/ginko-content": minor
"@lupinum/ginko-components": minor
"@lupinum/ginko-docs": minor
"@lupinum/ginko-preset-gastro": minor
"create-ginko": minor
---

Ginko 0.1: one content system for Nuxt websites, from Markdown files in Git to a hosted platform that owners, staff and AI agents edit together. All packages release together under one version. Until 1.0, a minor version (0.1 → 0.2) may contain breaking changes; the changelog names each one and how to update.

Requirements: Node 22.18+, 24 or 26, and Nuxt 4.6+. Start a site with `npm create ginko@latest my-site`; the documentation explains every step.

Public API: `@lupinum/ginko` (`defineSite`, `single`, `collection`, `f`, `formatMoney`, `plainText`, `weekStartOf` and the types), `@lupinum/ginko/nuxt` (the module, the `useGinko*` composables, `ginkoLangOf`, `ginkoSafeHref`, `isGinkoVisible`, `<GinkoMarkdown>`, `<GinkoImage>`) and `@lupinum/ginko/vue` (`<GinkoMarkdown>`). `@lupinum/ginko/internal` has no stability promise. The `ginko` CLI commands `check`, `release` and `export` are public; `dev`, `import` and `pull` run only in the Ginko monorepo.

Names to know: field helpers take one options object (`f.choice(label, { options })`, `f.ref(label, { to })`, `f.list(label, { itemLabel, fields, max })`); `useGinkoPath` gives page paths; `useGinkoNeighbors(brick, id, { order })`; `formatMoney` is imported from `@lupinum/ginko`, not auto-imported; `Query.order` also takes `{ field, dir }`; the option type is `ChoiceOption`. The CLI reads `GINKO_PLATFORM` or `NUXT_PUBLIC_GINKO_PLATFORM`, and `GINKO_COMMIT` or `GITHUB_SHA`.

**Names in the packages (renamed before 0.1, so nothing to migrate)**

- `@lupinum/ginko-i18n`: the locale object type is `LocaleInfo` (core's `Locale` is the string). CLI: `check --html <dir>` (was `--site`), `--default-locale` (was `--default`), `todo --locale <code>` (`--to` still works). `seo` also takes an object. The finding codes are listed in the README.
- `@lupinum/ginko-components` (these are the words editors write in Markdown): the heading is `title` on `aside`, `excerpt`, `tab`, `accordion-item`, `collapse` and `read-more` (was `label`); `timeline-item` `label` is `meta`; `badge` colour `error` (was `danger`); `layout` and `center` take `frame` (was `type`); `column` takes `fit` (was `media`); `api-param` takes the flag `required` (was `presence="required"`; the `?` marker of `presence="optional"` is gone).
- `@lupinum/ginko-docs`: `docsCollection({ locales, base, label, max })`, `blogCollections({ locales, max })`, `blogPages({ locales })`, `changelogPages({ locales })` take one options object. The layer's composables are `useDocsBlog` and `useDocsCopy`; its helpers are no longer auto-imported into the host app.
- `@lupinum/ginko-preset-gastro`: `hours({ calendar })` (was `holidays`; the stored field `holidays` is unchanged). The package lists its exports; date, holiday-table, `Money` and `weekOf` helpers are internal.
- `@lupinum/ginko-content`: `buildFileBundles({ contentDir, publicDir, schema, now?, drafts?, imageDir? })`; `readContent` is internal.
- Dependencies: `@lupinum/ginko` is a peer dependency of content, components, docs and the gastro preset (install it once in the site); `@lupinum/ginko-content` is a peer of docs, `@lupinum/ginko-i18n` a peer of components, and `sharp` an optional peer of content. `create-ginko` lists them in the new site.

**Content (`@lupinum/ginko`, `@lupinum/ginko-content`)**

- One text format: Markdown (comark 0.7) everywhere, with field profiles that limit what a field may contain. Footnotes, emoji, alerts, Shiki code, task lists, route links (`$blog.my-post`), reusable snippets and heading anchors.
- Data files: YAML and JSON (one file, one entry) and CSV (one file, many entries), checked against the field schema; every error names the file and field, and the line for CSV rows and unreadable files. Entries with `draft: true` stay out of production builds.
- Query engine in the site, over the loaded bundle: `where`, `order`, `limit`, pagination with totals, field selection, `include` for references, previous/next and facet counts.
- References (`f.ref`), navigation trees and breadcrumbs, and a URL for every entry in every language; two entries on one URL fail the build.
- Link check before any HTML exists: route links, anchors, snippets and redirected paths, in the build, the dev terminal, `ginko check` and the agent tools. On the platform a save, a new entry or a scheduled publish that adds a broken link is stopped, and History says why. External links are checked on request (`links.external`), at build only, with a 7-day cache.
- Images: WebP copies at 480, 960 and 1600 px, made at upload on the platform and at build for files. `<GinkoImage>` and Markdown images get `srcset` and `sizes`.
- Redirects from `redirectFrom` and site patterns, always 301.
- SEO from the bundle: title template, canonical, Open Graph, `<html lang>`, hreflang with `x-default`, sitemap with `lastmod`, images and alternates, robots.txt with `noindex` on preview hosts, JSON-LD. With `nuxt-og-image` installed, every page without its own image gets a generated share card.
- Search index built in plain JS at build time, one record per heading section, loaded lazily per language.
- Agent output: `/llms.txt`, `/llms-full.txt`, a `.md` twin for every page, `Accept: text/markdown`, and a Markdown 404 that suggests pages.
- Render modes: Git-only sites prerender everything; platform sites refresh changed pages after a publish; previews render with `noindex`.
- CLI `ginko`: `check` (schema and links, for every site) and `release` for CI, `export` for backups; `dev`, `import` and `pull` run only in the Ginko monorepo.

**Languages (`@lupinum/ginko-i18n`)**

- The only locale authority: routes, alternates, hreflang, messages with plurals, and formatters for dates, ranges, relative time, numbers, currency and lists, each in the site's time zone.
- Works on its own in any Nuxt 4.6+ app, without the rest of Ginko.

**Components and docs (`@lupinum/ginko-components`, `@lupinum/ginko-docs`)**

- Content components with props defined as Ginko fields: callouts, tabs, code groups, steps, cards, accordion, figures, embeds (click to load), timeline, quiz and more. Each one can also be copied into an app with the shadcn-vue CLI, from a registry the docs build generates.
- Docs preset: navigation, section tabs, breadcrumbs, table of contents with scroll spy, previous/next, ⌘K search with heading results, blog with authors and RSS, changelog, copy page as Markdown, dark mode. A guide for switching from Nuxt Content and `@nuxtjs/i18n`. Math (KaTeX) and mermaid diagrams render and load only on pages that use them.

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
- `create-ginko` starts a new site, plain or with `--preset gastro|docs`.

**Not in 0.1**

Real-time co-editing comes next. Also not included: an agency preset, the editor UI as a shadcn-vue registry, OAuth for agent connectors, and a Google Business sync.
