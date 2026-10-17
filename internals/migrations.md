# Migrations

Temporary compatibility code that is still active. Each entry says why it exists, since when, what depends on it,
the exact condition for removing it and the tracking issue when there is one. Remove the code and its entry together.

Run each step on a local backend in `packages/ginko-server` with `pnpm exec better-convex convex run <function> '{}'`.
Hosted production needs Matthias's OK at each step, in this order:

1. Back up production before the release that brings the code reaches the production branch: in the Convex
   dashboard (the production deployment's backups), or with the plain Convex CLI
   `npx convex export --path <file>.zip` in the production checkout's `packages/ginko-server` (the `better-convex`
   wrapper has no `export`; the key in that `.env.local` must be allowed to export). A merge deploys Convex by itself,
   so a backup after the merge is too late.
2. Merge to the production branch. The Vercel production build deploys Convex, then builds the Studio.
3. In the production checkout (see the [`ginko-server` README](../packages/ginko-server/README.md)), run the step
   with `pnpm exec better-convex convex run <function> '{}'`.

## Entry storage: trees in `entryTrees`, text-only budget, separate trash (`entries:migrateStorage`)

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
  production). Until `migrateStorage` ran there, its counters are approximate: `bytes` still holds trees and trash,
  so the budget checks are stricter, never looser; the trees guard sees only trees written since.
- **Steps:**
  1. Deploy this code (expand step). Writers already put trees into `entryTrees` and clear `entries.trees`.
  2. `pnpm exec better-convex convex run entries:migrateStorage '{}'` (10 entries per run, schedules itself, then
     `recountStorage` sets each site's `bytes`, `trashBytes` and `treeBytes` to the sums over its entries). Running it
     again is safe.
  3. Check with `pnpm exec better-convex convex run entries:storageStatus '{}'` (one site per call; pass the returned
     `cursor` until `isDone`): every site `legacyRows: 0`, `countersMatch: true`, `overLimit: []`.
  4. Hosted production: steps 2 and 3 as described at the top (backup, merge, then run in the production checkout).
  5. Contract step: remove `entries.trees` from the schema, make `entries.treeBytes`, `entries.contentAt`,
     `sites.trashBytes` and `sites.treeBytes` required, delete the fallbacks and the `?? 0` above, and give the rows that tests insert directly (`packages/ginko-server/test/setup.ts` and others) the
     new fields. Convex refuses this deploy while any row still has `trees`, which is a safety net.
- **Rollback after step 2:** the code before this change parses rows without `trees` per request (slower, correct);
  run its `entries:rebuildTrees` to restore its trees and counters.
- **Removal condition:** `storageStatus` reports `legacyRows: 0` and `countersMatch: true` for every site on every
  deployment (local backends included, or they are reset), then ship step 5.

## Unused `sites.orderRevs`

- **Why:** the old `entries.reorder` sent the whole order of a brick with an `orderRev`, and `orderRevs` (one count
  per brick on the site row) caught a concurrent reorder. `entries.move` writes one order value per move, so nothing
  reads or writes `orderRevs` any more. Sites stored before the change still hold it.
- **Introduced:** 15 October 2026.
- **Compatibility code:** `convex/schema.ts`: `sites.orderRevs` is optional; `sites:dropOrderRevs` unsets it.
- **Dependents:** every deployment with sites created before the introduction date (local backends, hosted production).
- **Steps:**
  1. Deploy this code. Nothing writes `orderRevs` from now on.
  2. `pnpm exec better-convex convex run sites:dropOrderRevs '{}'` (one call; it reports how many sites it cleared;
     running it again is safe). Hosted production as described at the top (backup, merge, then run in the production
     checkout).
  3. Contract step: remove `orderRevs` from `convex/schema.ts` and delete `dropOrderRevs`. Convex refuses this deploy
     while any site still has the field, which is a safety net.
- **Removal condition:** `sites:dropOrderRevs` answered `cleared: 0` on every deployment (local backends included, or
  they are reset), then ship step 3.
- **Tracking issue:** none yet.



## Storage addresses in Markdown texts become `$file` references (`migrations:markdownStorageUrls`)

- **Why:** before `$file.<uploadId>` existed, the Studio wrote a picture pasted into a Markdown text as its storage
  address (`http://127.0.0.1:3210/api/storage/…` locally). Such a file has no file reference: the daily sweep purges it
  after 7 days (the text then shows a hole), Trash does not warn and backups leave it out, and an export carries the
  host it was written on. The migration rewrites every address that matches a current storage address of one of the
  site's uploads (original, processed file or variant) to `$file.<uploadId>`, then rebuilds the entry's trees and
  file references; addresses that match nothing stay. At the end `entries:recountStorage` sets the site counters.
- **Introduced:** 15 October 2026.
- **Compatibility code:** `packages/ginko-server/convex/migrations.ts` (the whole module) and its line in
  `convex/_generated/api.d.ts`. Nothing else reads old addresses.
- **Dependents:** every deployment whose texts hold storage addresses: local backends with pictures pasted into texts,
  and possibly hosted production. Run it before the next daily sweep where a pasted picture is younger than 7 days.
- **Steps:**
  1. Local: `pnpm exec better-convex convex run migrations:markdownStorageUrls '{}'` (10 entries per run, schedules
     itself; running it again is safe). Then `pnpm exec better-convex convex run entries:storageStatus '{}'` until
     `isDone` (pass the returned `cursor`): `countersMatch: true` for every site.
  2. Hosted production: step 1 as described at the top (backup, merge, then run in the production checkout).
- **Removal condition:** the migration ran on every local backend that keeps its data and on hosted production. Then
  delete `convex/migrations.ts`, its line in `convex/_generated/api.d.ts`, its test in
  `packages/ginko-server/test/files.test.ts` and this entry.
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
