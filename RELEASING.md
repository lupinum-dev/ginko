# Releasing Ginko

Seven packages are published to npm and always share one version (the `fixed` group in
`.changeset/config.json`): `@lupinum/ginko`, `@lupinum/ginko-i18n`, `@lupinum/ginko-content`,
`@lupinum/ginko-components`, `@lupinum/ginko-docs`, `@lupinum/ginko-preset-gastro` and `create-ginko`.

The first release is 0.4.0: `@lupinum/ginko-content` and `@lupinum/ginko-docs` already have an older line
up to 0.3.x on npm, so the packages start at 0.3.0 and the first minor changeset makes them 0.4.0. Until 1.0, a minor version may contain breaking changes, and the changelog
names each one with how to update; a patch never breaks anything. The quality bar is a 1.0 all the same:
no public name we expect to change, docs that work as written.

`@lupinum/ginko-server`, `@lupinum/ginko-studio`, `@lupinum/ginko-editor` and
`@lupinum/ginko-preset-agency` stay `private`: they run only on the platform that Lupinum hosts.
No published package may depend on them.

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

There is no npm token. The pack job needs `pnpm build` to work and `scripts/release.mjs` to find no dependency
cycle between the published packages (a peer dependency counts).

### First publication of the new packages

npm attaches a trusted publisher only to a package that exists. These packages are not on npm yet:
`@lupinum/ginko`, `@lupinum/ginko-i18n`, `@lupinum/ginko-components`, `@lupinum/ginko-preset-gastro`, `create-ginko`.
Follow "First publication of a new package" in the handbook: reject the `npm` deployment of the first run, download its
`release` artifact, publish only those tarballs by hand with
`npm publish ./release/<file>.tgz --access public --ignore-scripts --tag latest` (`--tag next` for a prerelease) and your 2FA code,
then set on every package the trusted publisher (workflow `release.yml`, environment `npm`) and "Require two-factor
authentication and disallow tokens". Then run `release.yml` by hand on `main`: it publishes the packages that already
exist (`@lupinum/ginko-content`, `@lupinum/ginko-docs`) with provenance and creates the tag and GitHub release.

## Repository

`lupinum-dev/ginko` is public since 12 Oct 2026 and starts from one commit ("Initial public commit"). The earlier
history is in the private `lupinum-dev/ginko-archive`; internal working files (plan, reviews, spikes) are
in the private `lupinum-dev/ginko-internal`. Keep them out of this repository.

Docs deploy: the shadcn registry items point at `<url>/r`, with `url` from `sites/docs/ginko.config.ts`; keep that
`url` the public docs address (`GINKO_REGISTRY_URL` overrides it).

## CI

`.github/workflows/ci.yml` runs typecheck, unit tests, `check:contracts` and `check:pack` on every pull
request and push to `main`. Its `ci` job is the one required status check, and `release.yml` waits for it
before it publishes.
