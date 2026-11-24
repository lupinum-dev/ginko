# Releasing Ginko

Seven packages are published to npm and always share one version (the `fixed` group in
`.changeset/config.json`): `@lupinum/ginko`, `@lupinum/ginko-i18n`, `@lupinum/ginko-content`,
`@lupinum/ginko-components`, `@lupinum/ginko-docs`, `@lupinum/ginko-preset-gastro` and `create-ginko`.

The first release is 0.4.0: `@lupinum/ginko-content` and `@lupinum/ginko-docs` already have an older line
up to 0.3.x on npm, so the packages start at 0.3.0 and the first minor changeset makes them 0.4.0. Until 1.0, a minor version may contain breaking changes, and the changelog
names each one with how to update; a patch never breaks anything. The quality bar is a 1.0 all the same:
no public name we expect to change, docs that work as written.

`@lupinum/ginko-server`, `@lupinum/ginko-studio` and `@lupinum/ginko-editor` release in the same group: people who host the
platform themselves install them (`create-ginko --platform`).

## Every change

Add a changeset for each user-facing change to a released package: `pnpm changeset`. Before a merge,
these must pass:

```bash
pnpm typecheck && pnpm test && pnpm check:contracts
pnpm check:pack   # packs the released packages, checks manifest, LICENSE and publint, installs a new site from the tarballs, builds, serves, runs `ginko check`
```

## A release

Handbook: [lupinum-oss, Releasing](https://github.com/lupinum-dev/lupinum-oss). `.github/workflows/release.yml` and
`scripts/release.mjs` are the handbook's files; do not edit them here, copy them again from the handbook.

1. Merging changesets into `main` makes `release.yml` open or update the **Version packages** pull request
   (new versions and `CHANGELOG.md` files). It starts `ci` on that pull request.
2. **Click 1:** read the diff of that pull request (only versions, `CHANGELOG.md` files and `.changeset/`), then merge it.
3. `release.yml` builds and packs every public package whose version is not on npm yet.
4. **Click 2:** approve the deployment to the `npm` environment in the Actions run. Read the run summary first
   ("Release files unchanged since ..."). The job publishes with npm trusted publishing and provenance, then creates the
   tag `v<version>` and the GitHub release.

The client platform lupinum-ginko-cms deploys release tags only (`.github/workflows/cms.yml`, D55). A fix that touches
only the platform packages (`ginko-server`, `ginko-studio`, …) reaches it only with a release: give it a patch changeset
for the package it changes.

There is no npm token. The pack job needs `pnpm build` to work and `scripts/release.mjs` to find no dependency
cycle between the published packages (a peer dependency counts).

### First publication of a new package

All ten packages of the group are on npm. The platform packages (`-server`, `-studio`, `-editor`) joined with 0.18.0
on 24 Nov 2026, published by hand.

npm attaches a trusted publisher only to a package that exists, so a package that joins the group later is first
published by hand, by Matthias with his 2FA code. First ask npm whether the name exists already (`npm view <name>`):
`@lupinum/ginko-editor` did, as `0.1.0` from the earlier repository `lupinum-dev/ginko-editor`.
Follow "First publication of a new package" in the handbook: reject the `npm` deployment of the first run, download its
`release` artifact, publish only the new tarballs by hand with
`npm publish ./release/<file>.tgz --access public --ignore-scripts --tag latest` (`--tag next` for a prerelease) and your 2FA code,
then set on every new package the trusted publisher (workflow `release.yml`, environment `npm`) and "Require two-factor
authentication and disallow tokens". Then run `release.yml` by hand on `main`: it publishes the packages that already
existed with provenance and creates the tag and GitHub release.

If the `npm` deployment was approved instead: the job publishes the packages that existed and fails at the first new
one. Publish the new tarballs by hand, wait until `npm view <name>@<version>` answers for each (a new package takes a
few minutes), then use "Re-run failed jobs" on the same run. It skips every version that is on npm and creates the tag.

## Repository

`lupinum-dev/ginko` is public since 12 Oct 2026 and starts from one commit ("Initial public commit"). The earlier
history is in the private `lupinum-dev/ginko-archive`; internal working files (plan, reviews, spikes) are
in the private `lupinum-dev/ginko-internal`. Keep them out of this repository.

Docs deploy: the Vercel project `lupinum-ginko-docs` (root `sites/docs`) builds only on a release (D70: the merge of
"Version packages") and serves `https://ginko.lupinum.com`. So merge docs for a release before its "Version packages"
pull request; a docs fix between releases goes live with "Redeploy" in Vercel or with the next release. The shadcn registry items point at `<url>/r`, with `url` from `sites/docs/ginko.config.ts`; keep that
`url` the public docs address (`GINKO_REGISTRY_URL` overrides it).

## CI

`.github/workflows/ci.yml` runs typecheck, unit tests, `check:contracts` and `check:pack` on every pull
request and push to `main`. Its `ci` job is the one required status check, and `release.yml` waits for it
before it publishes.
