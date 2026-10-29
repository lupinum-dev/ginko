# Ginko

Ginko is a content system for Nuxt websites (see [README.md](README.md)). This repository is a pnpm
workspace. Seven packages in `packages/` are published to npm and always release with one version
(a Changesets `fixed` group): `@lupinum/ginko` (main entry point), `-i18n`, `-content`, `-components`,
`-docs`, `-preset-gastro` and `create-ginko`.

## Layout

- `packages/`: the published packages above, plus three `private` ones that run only on the platform
  Lupinum hosts: `ginko-server`, `ginko-studio`, `ginko-editor`. No published
  package may depend on a private one.
- `sites/` demo and docs sites, `apps/platform` the hosted platform, `contracts/` the schemas the demo sites publish, `e2e/` Playwright tests.
- `templates/<name>` complete starter sites that keep real `@lupinum/*` ranges (root overrides link them to the local
  packages; run their scripts from the root: `pnpm --filter <name> run …`), `templates/_features` their shared
  sources. `pnpm templates sync | sync --check | test <name> | dev <name>` (scripts/templates.ts).

## Commands

```bash
pnpm install
pnpm typecheck && pnpm test && pnpm check:contracts   # core checks; keep vitest at --maxWorkers=2 on a shared machine
pnpm check:pack      # packs the released packages, installs a new site from the tarballs, builds and serves it
pnpm build           # builds the seven published packages
pnpm lint            # changeset style
pnpm verify          # what CI runs: lint, typecheck, test, contracts, pack, dependency audit
pnpm changeset       # describe a user-facing change for the next release
pnpm e2e:platform    # platform e2e on a fresh local backend: sets the local Convex state aside, starts and stops
                     # everything, exit code = Playwright's; extra args go to Playwright (e.g. e2e/f6.spec.ts)
```

Heavy runs (`pnpm templates test`, `pnpm e2e:platform`) take a machine-wide lock (one at a time; a waiting run names
the holder) and wait up to 15 minutes for the 1-minute load average to drop below the CPU count. `GINKO_NO_LOAD_WAIT=1`
skips that wait (CI). A setup error (install, build, server start, global setup) is a failed gate, never a skipped one.

## Rules

- Site code imports from `@lupinum/ginko`. `@lupinum/ginko/internal` is for Ginko's own packages and has
  no stability promise; do not use it in sites or docs.
- Use Conventional Commits, for example `fix(content): keep the slug of a renamed file`.
- Add a changeset (`pnpm changeset`) to every pull request that changes a published package. Style: one
  line that starts with Fix, Add, Remove or Change and says what changed for users. Tooling, tests and
  docs need none.
- Never publish, tag or release by hand, and never add an `NPM_TOKEN`. Releases follow
  [RELEASING.md](RELEASING.md): merge the "Version packages" PR, then approve the `npm` environment.
- Do not bypass the 24-hour dependency quarantine (`minimumReleaseAge` in `pnpm-workspace.yaml`). Only
  `@lupinum/*` is excluded.
- Pin GitHub Actions to full commit SHAs. `release.yml`, `preview.yml` and the `scripts/` release files come from the
  Lupinum OSS handbook: copy them again, do not edit them here.
- Keep the repository free of internal working files (plans, reviews, spikes); they live in the private
  `lupinum-dev/ginko-internal`.
- Record lasting choices in [internals/decisions.md](internals/decisions.md).
