# Decisions

A short, dated log of choices a future maintainer or agent might otherwise undo.
Add one line per decision: `Dn (YYYY-MM-DD): decision — why.` Replace a line
when a decision changes; git keeps the history.

- D1 (2026-10-13): Release with the Lupinum OSS `library-monorepo` workflow (Changesets, npm trusted publishing, protected `npm` environment) — every Lupinum repository shares one release, security and CI setup.
- D2 (2026-10-13): `@lupinum/ginko` declares no peer dependency on `@lupinum/ginko-content` — `ginko-content` depends on `ginko`, and a cycle between published packages stops `scripts/release.mjs` from packing. `ginko` still loads `ginko-content` with a dynamic import and tells users to install it; it is only a devDependency (types, tests) and an unbuild external.
- i18n package decisions (D1 onwards): [packages/ginko-i18n/DECISIONS.md](../packages/ginko-i18n/DECISIONS.md).
