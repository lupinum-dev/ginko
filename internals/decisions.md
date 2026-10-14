# Decisions

A short, dated log of choices a future maintainer or agent might otherwise undo.
Add one line per decision: `Dn (YYYY-MM-DD): decision — why.` Replace a line
when a decision changes; git keeps the history.

- D1 (2026-10-13): Release with the Lupinum OSS `library-monorepo` workflow (Changesets, npm trusted publishing, protected `npm` environment) — every Lupinum repository shares one release, security and CI setup.
- D2 (2026-10-13): `@lupinum/ginko` declares no peer dependency on `@lupinum/ginko-content` — `ginko-content` depends on `ginko`, and a cycle between published packages stops `scripts/release.mjs` from packing. `ginko` still loads `ginko-content` with a dynamic import and tells users to install it; it is only a devDependency (types, tests) and an unbuild external.
- D3 (2026-10-14): Every published package accepts Nuxt 4.6 and Nuxt 5: `nuxt` peer range and module `compatibility` are both `^4.6.0 || ^5.0.0-0` — a site can upgrade Nuxt without upgrading Ginko, and npm installs Ginko next to a Nuxt 5 prerelease without a peer conflict. Proof: `pnpm check:pack --nuxt5` (CI job `nuxt5`) builds every starter and the docs site from the tarballs on the Nuxt 5 nightly that `packages/ginko-i18n/browser/apps/n5` pins. Move that pin forward when a newer nightly is needed; drop the `-0` when Nuxt 5 is released.
- i18n package decisions (D1 onwards): [packages/ginko-i18n/DECISIONS.md](../packages/ginko-i18n/DECISIONS.md).
