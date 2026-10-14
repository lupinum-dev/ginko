# Migrations

Temporary compatibility code that is still active. Each entry says why it exists, since when, what depends on it,
the exact condition for removing it and the tracking issue when there is one. Remove the code and its entry together.

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
  2. `npx convex run entries:migrateStorage` (10 entries per run, schedules itself, then `recountStorage` sets each
     site's `bytes`, `trashBytes` and `treeBytes` to the sums over its entries). Running it again is safe.
  3. Check with `npx convex run entries:storageStatus` (one site per call; pass the returned `cursor` until
     `isDone`): every site `legacyRows: 0`, `countersMatch: true`, `overLimit: []`.
  4. Hosted production needs Matthias's OK at each step: `npx convex export --prod` first, then deploy, then
     `npx convex run --prod entries:migrateStorage`, then `storageStatus` with `--prod`.
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
  2. `npx convex run sites:dropOrderRevs` (one call; it reports how many sites it cleared; running it again is safe).
     Hosted production needs Matthias's OK: `npx convex export --prod` first, then
     `npx convex run --prod sites:dropOrderRevs`.
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
  1. Local: `npx convex run migrations:markdownStorageUrls` (10 entries per run, schedules itself; running it again
     is safe). Then `npx convex run entries:storageStatus` until `isDone`: `countersMatch: true` for every site.
  2. Hosted production only with Matthias's OK, after `npx convex export --prod`:
     `npx convex run --prod migrations:markdownStorageUrls`, then `storageStatus` with `--prod`.
- **Removal condition:** the migration ran on every local backend that keeps its data and on hosted production. Then
  delete `convex/migrations.ts`, its line in `convex/_generated/api.d.ts`, its test in
  `packages/ginko-server/test/files.test.ts` and this entry.
- **Tracking issue:** none yet.
