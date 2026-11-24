# Migrations

Temporary compatibility code that is still active. Each entry says why it exists, since when, what depends on it,
the exact condition for removing it and the tracking issue when there is one. Remove the code and its entry together.

## Data migrations run by themselves after a deploy

The platform's one-time data migrations are list entries in `packages/ginko-server/convex/lib/migrations.ts`
(`MIGRATIONS`). Nobody runs them by hand:

- A production build (`ginko-platform build`, also the build of `apps/platform`) calls
  `npx convex run --prod migrations:runPending` right after `convex deploy`. It starts the next migration that has not finished and prints one line, for example
  `Migrations: all 5 done.` or `Migrations: started <name> (2 pending)`. The migrations run in the background, one
  after the other, in list order; the build does not wait for them. If the call fails, the build only warns: the new
  backend is live already. A platform deployed without this command runs the same two commands.
- `pnpm local:dev`, `scripts/setup-local.ts`, the platform e2e run and the platform template test call it on the local
  backend (`prepareLocalBackend`), so local backends that keep their data are migrated too.
- A fresh deployment (no site, no run recorded) records every migration as done without running any.
- `npx convex run ops:status` shows `migrations`: how many are done, which are pending, the running one, and a stopped
  one with its error (a page that threw, or a job canceled in the dashboard). A stopped migration starts again from
  where it stopped with the next deploy (or the next `runPending` call); it is not retried in a loop.
- Each run is a row in the `serverMigrations` table. `migrationsApplied` is something else: the content migrations
  that a site's own config sends with a release.

Hosted production, with Matthias's OK, in this order:

1. Back up production before the release that brings a new migration reaches the production branch: in the Convex
   dashboard (the production deployment's backups), or with the plain Convex CLI
   `npx convex export --path <file>.zip` in the production checkout's `packages/ginko-server` (the `better-convex`
   wrapper has no `export`; the key in that `.env.local` must be allowed to export). A merge deploys Convex and starts
   the migrations by itself, so a backup after the merge is too late.
2. Merge to the production branch. The Vercel build deploys Convex, starts the migrations, then builds the Studio.
3. Read the `Migrations:` line in the build log, then `ops:status` until nothing is running or stopped.

Rules for a new migration:

1. Safe to run again, page by page. A restart repeats at most the page of an action step.
2. Expand/contract: the release with the migration reads the old and the new shape (an old Studio tab and the new
   backend keep working while it runs); removing the old shape is a later release.
3. A step takes `{ run, cursor }` (`stepArgs`), does one page that fits one mutation and ends with `advance(ctx, run,
   next)` (`next = null` after the last page); a mutation step calls it in the same transaction, an action step through
   `internal.migrations.advance`. Steps never schedule themselves.
4. Rewritten editable content raises `rev` and `fieldRevs`, so a Studio draft of the old text gets a conflict; changed
   published output raises `contentRev`, so bundle caches refresh.
5. A new date-prefixed name, appended to the list; never renamed or reused. A changed step (other table, index or
   meaning of the cursor) is a new list entry. Rerunning `entries.migrateStorage` after a parser change is a new
   entry that points at it.
6. It stays in the list, with its step, until the next major version: self-hosted platforms can skip versions, so
   "it ran on every deployment" can never be known. The major's release notes say "update to the last version before
   it first and wait until `ops:status` shows no pending migration"; contract steps ship with that major.
7. An entry in this file, and a test that runs it through `migrations:runPending`.

## Entry storage: trees in `entryTrees`, text-only budget, separate trash (`2026-10-14-entry-storage`)

- **Why:** Markdown trees moved from the entry row (`entries.trees`) to the `entryTrees` table, the budget counts only
  an entry's text (`bytes` = core `entryBytes`), removed entries count in `sites.trashBytes` instead of `sites.bytes`,
  and the bundle's `updatedAt` comes from `entries.contentAt` instead of change rows. Rows written before this have
  trees on the row, budget bytes with trees, and none of the new fields.
- **Introduced:** 14 October 2026.
- **Compatibility code:**
  - `convex/schema.ts`: `entries.trees`, `entries.treeBytes`, `entries.contentAt`, `sites.trashBytes` and
    `sites.treeBytes` are optional.
  - `convex/bundle.ts` `storedTrees`: falls back to the legacy `entries.trees`; `updatedAt` falls back to
    `_creationTime` for a row without `contentAt`.
  - `?? 0` on `treeBytes` and `trashBytes` in `lib/lifecycle.ts` `countersOf`, `lib/write.ts` `commitEntry`,
    `release.ts` and `seed.ts`.
- **Dependents:** every deployment with entries written before the introduction date (local backends, hosted
  production). Until the migration ran there, its counters are approximate: `bytes` still holds trees and trash,
  so the budget checks are stricter, never looser; the trees guard sees only trees written since.
- **Steps:**
  1. Deploy this code (expand step). Writers already put trees into `entryTrees` and clear `entries.trees`.
  2. The list runs `entries:migrateStorage` (10 entries per page), and later `2026-10-15-recount-storage`
     (`entries:recountStorage`, one site per page), which sets each site's `bytes`, `trashBytes` and `treeBytes` to
     the sums over its entries.
  3. Optional check: `entries:storageStatus '{}'` (one site per call; pass the returned `cursor` until `isDone`):
     every site `legacyRows: 0`, `countersMatch: true`, `overLimit: []`.
  4. Contract step (next major, rule 6): remove `entries.trees` from the schema, make `entries.treeBytes`,
     `entries.contentAt`, `sites.trashBytes` and `sites.treeBytes` required, delete the fallbacks and the `?? 0`
     above, and give the rows that tests insert directly (`packages/ginko-server/test/setup.ts` and others) the new
     fields. Convex refuses this deploy while any row still has `trees`, which is a safety net.
- **Rollback after step 2:** the code before this change parses rows without `trees` per request (slower, correct);
  run its `entries:rebuildTrees` to restore its trees and counters.
- **Removal condition:** the next major version, with step 4.

## Unused `sites.orderRevs` (`2026-10-15-drop-order-revs`)

- **Why:** the old `entries.reorder` sent the whole order of a brick with an `orderRev`, and `orderRevs` (one count
  per brick on the site row) caught a concurrent reorder. `entries.move` writes one order value per move, so nothing
  reads or writes `orderRevs` any more. Sites stored before the change still hold it.
- **Introduced:** 15 October 2026.
- **Compatibility code:** `convex/schema.ts`: `sites.orderRevs` is optional; the step `sites:dropOrderRevs` unsets it.
- **Dependents:** every deployment with sites created before the introduction date (local backends, hosted production).
- **Steps:**
  1. Deploy this code. Nothing writes `orderRevs` from now on; the list runs `sites:dropOrderRevs` (one page).
  2. Contract step (next major): remove `orderRevs` from `convex/schema.ts`, delete `dropOrderRevs` and its list
     entry. Convex refuses this deploy while any site still has the field, which is a safety net.
- **Removal condition:** the next major version, with step 2.
- **Tracking issue:** none yet.

## Storage addresses in Markdown texts become `$file` references (`2026-10-15-markdown-storage-urls`)

- **Why:** before `$file.<uploadId>` existed, the Studio wrote a picture pasted into a Markdown text as its storage
  address (`http://127.0.0.1:3210/api/storage/…` locally). Such a file has no file reference: the daily sweep purges it
  after 7 days (the text then shows a hole), Trash does not warn and backups leave it out, and an export carries the
  host it was written on. The migration rewrites every address that matches a current storage address of one of the
  site's uploads (original, processed file or variant) to `$file.<uploadId>`, then rebuilds the entry's trees and
  file references; addresses that match nothing stay. The recount after it sets the site counters.
- **Introduced:** 15 October 2026.
- **Compatibility code:** the step `migrations:markdownStorageUrls` in `packages/ginko-server/convex/migrations.ts`.
  Nothing else reads old addresses.
- **Dependents:** every deployment whose texts hold storage addresses: local backends with pictures pasted into texts,
  and possibly hosted production.
- **Steps:** deploy; the list runs it (10 entries per page).
- **Removal condition:** the next major version. Then delete the step, its list entry, its tests in
  `packages/ginko-server/test/files.test.ts` and this entry.
- **Tracking issue:** none yet.

## WebP copies for images uploaded before they existed (`2026-10-12-image-variants`)

- **Why:** new image uploads get WebP copies at 480, 960 and 1600 px for srcset; images processed before that have
  none (`uploads.variants` missing).
- **Introduced:** 12 October 2026 at the latest.
- **Compatibility code:** the step `images:variantsMigration`; `uploads.variants` is optional (missing = not made yet).
  `images:backfillVariants` stays as the follow-up of an import (`seed.ts`), not as a migration.
- **Dependents:** deployments with images uploaded before the variants (hosted production, older local backends).
- **Steps:** deploy; the list runs it (20 uploads per page, a Node action).
- **Removal condition:** the next major version. Then delete the step and its list entry; `variants` can stay optional
  because an import still fills it later.
- **Tracking issue:** none yet.

## Hour plans found by shape (`hourPlanKeys` in `convex/lib/status.ts`)

- **Why:** the hours single now names its hour plans in the stored schema (`status: { hours: { plans: '<key>' } }`,
  basics and gastro `hours({ plans })`), and the server reads the plans of that key only. A schema stored before the
  link has `status: { hours: true }` and no key; for it the server still takes every live collection shaped like
  `hourPlans()` (a list `week`, a date `from`, a switch `yearly`), as it did before.
- **Introduced:** 16 October 2026.
- **Compatibility code:** the `{ hours: true }` branch of `hourPlanKeys` in `packages/ginko-server/convex/lib/status.ts`.
  `{ hours: true }` itself stays valid: a site without hour plans keeps it.
- **Dependents:** sites whose config has `hours()` and `hourPlans()` but no `plans` option: the templates with opening
  hours (restaurant, local-business) until they pass `hours({ plans: 'hourPlans' })`, and every hosted or local site
  whose last pushed schema predates its config's `plans` (nothing changes for it until its next push).
- **Removal condition:** every template and site in this repository that has `hourPlans()` passes `plans` to
  `hours()`, and a query over hosted production (and local backends that keep their data) finds no site whose stored
  schema has `status: { hours: true }` together with a live collection of the hour-plan shape. Then the branch returns
  no keys for `{ hours: true }`; delete it, this entry and the shape lookup's mention in the doc comment.
- **Tracking issue:** none yet.

## The figure's edge choice `focus` (retired prop and its CSS)

- **Why:** a figure now keeps the focus point of its library picture in view (D57), so the editor no longer offers
  the figure's own `focus` (`top`, `bottom`, `left`, `right`). Texts written before still have it; refusing it would
  make them fail the check when they are saved again.
- **Introduced:** 26 October 2026.
- **Compatibility code:** the `focus` prop with `retired: true` in `packages/ginko-components/src/registry-media.ts`,
  the `focus` prop of `Figure.vue` (`data-focus`) and the four `data-focus` rules in `src/runtime/media.css`.
- **Dependents:** stored Markdown texts with `::figure{… focus="…"}` on any platform, and files sites that use it.
- **Removal condition:** a query over hosted production and the demo platform finds no entry text with a figure
  that has `focus=`, and the next major version of the published packages (removing a prop is breaking for files
  sites). Then delete the prop, the attribute, the four rules and this entry.
- **Tracking issue:** none yet.

## Docs site: redirects from the German and the `/en` addresses (`sites/docs/ginko.config.ts` `redirects`)

- **Why:** ginko.lupinum.com is in English only since 23 November 2026. Before that it had two layouts: until
  21 November German was the main language (German pages without a prefix, English under `/en`); from 21 to
  23 November English was the main language and German lived under `/de`. Links and search results still point at
  those addresses.
- **Introduced:** 21 November 2026 (`/en` and the German-first addresses), 23 November 2026 (`/de`).
- **Compatibility code:** the `redirects` list in `sites/docs/ginko.config.ts` with `germanDocs` (the 81 German slugs
  and their English pages), `germanFirst` (the 13 German slugs that had no prefix) and `germanPosts`: `/en`,
  `/en/docs/*`, `/en/blog/*` and `/en/changelog` lose the prefix; `/de`, `/de/docs/<German slug>`, `/de/blog/…` and
  `/de/changelog` go to the English page; the German-first `/docs/<German slug>` and the two German posts too. Every
  rule leads straight to an English page. German `/docs/presets` is covered by `movedDocs` below.
- **Dependents:** external links, search engines and the READMEs of the packages published before the switch.
- **Remove when:** Search Console shows no clicks on the old addresses for 3 months, at the earliest in June 2027.

## Docs site: redirects from the pages that the rewrite split (`sites/docs/ginko.config.ts` `movedDocs`)

- **Why:** the rewrite of the docs in November 2026 split seven long pages into guides and reference pages:
  Languages, Presets, SEO and agents, Deploy, Platform and CLI, Docs sites and Docs layer exports. On 23 November the
  tutorial in five chapters absorbed Build a site by hand. Their addresses no longer have a page.
- **Introduced:** 22 November 2026 (seven pages), 23 November 2026 (`build-a-site-by-hand` → `tutorial`).
- **Compatibility code:** `movedDocs` in `sites/docs/ginko.config.ts` and the rules made from it: `/docs/<old>` and
  `/en/docs/<old>` go to the page that now holds most of the content, and so does `/de/docs/<old German slug>`
  (through `german` in the same file).
- **Dependents:** external links, search engines, and the READMEs of the packages on npm up to 0.17.0, which link to
  `/docs/languages` and `/docs/platform-and-cli`.
- **Remove when:** together with the German redirects above, and a release after 0.17.0 has the new README
  links on npm.
