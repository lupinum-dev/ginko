# Migrations

Temporary compatibility code that is still active. Each entry says why it exists, since when, what depends on it,
and the exact condition for removing it. Remove the code and its entry together.

## Entry storage: trees in `entryTrees`, text-only budget, separate trash (`entries:migrateStorage`)

- **Why:** Markdown trees moved from the entry row (`entries.trees`) to the `entryTrees` table, the budget counts only
  an entry's text (`bytes` = core `entryBytes`), and removed entries count in `sites.trashBytes` instead of
  `sites.bytes`. Rows written before this have
  trees on the row, budget bytes with trees, and none of the new fields.
- **Introduced:** 14 October 2026.
- **Compatibility code:**
  - `convex/schema.ts`: `entries.trees`, `entries.treeBytes`, `sites.trashBytes` and
    `sites.treeBytes` are optional.
  - `convex/bundle.ts` `storedTrees`: falls back to the legacy `entries.trees`.
  - `convex/sites.ts` `get`: strips the legacy `trees` from the entries it returns.
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
  5. Contract step: remove `entries.trees` from the schema, make `entries.treeBytes`,
     `sites.trashBytes` and `sites.treeBytes` required, delete the fallbacks and the `?? 0` above and the strip in
     `sites.get`, and give the rows that tests insert directly (`packages/ginko-server/test/setup.ts` and others) the
     new fields. Convex refuses this deploy while any row still has `trees`, which is a safety net.
- **Rollback after step 2:** the code before this change parses rows without `trees` per request (slower, correct);
  run its `entries:rebuildTrees` to restore its trees and counters.
- **Removal condition:** `storageStatus` reports `legacyRows: 0` and `countersMatch: true` for every site on every
  deployment (local backends included, or they are reset), then ship step 5.
