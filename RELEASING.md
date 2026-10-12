# Releasing Ginko

Seven packages are published to npm and always share one version (the `fixed` group in
`.changeset/config.json`): `@lupinum/ginko`, `@lupinum/ginko-i18n`, `@lupinum/ginko-content`,
`@lupinum/ginko-components`, `@lupinum/ginko-docs`, `@lupinum/ginko-preset-gastro` and `create-ginko`.

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

Once, before the first release:

1. `npm whoami` must be a member of the `@lupinum` npm org with publish rights (2FA or an automation token).

Every release, on `main` with a clean tree:

```bash
GITHUB_TOKEN=<token with repo read> pnpm changeset version   # bumps versions, writes CHANGELOG.md files
git diff                                                      # read the changelogs
pnpm install && pnpm check:pack
git commit -am "chore(release): v$(node -p "require('./packages/ginko/package.json').version")"
pnpm changeset publish                                        # publishes and creates the git tags
git push --follow-tags
```

`@changesets/changelog-github` needs `GITHUB_TOKEN` to link commits and pull requests.

Later: publish from GitHub Actions with `changesets/action` and `NPM_CONFIG_PROVENANCE=true` (provenance
needs a public repository and an OIDC publish).

## Repository

`lupinum-dev/ginko` is public since 12 Oct 2026 and starts from one commit ("Initial public commit"). The earlier
history is in the private `lupinum-dev/ginko-archive`; internal working files (plan, reviews, spikes) are
in the private `lupinum-dev/ginko-internal`. Keep them out of this repository.

Docs deploy: set `GINKO_REGISTRY_URL` to the public `/r` address, or the shadcn registry items point at
localhost.

## CI

`.github/workflows/ci.yml` runs typecheck, unit tests, `check:contracts` and `check:pack` on every pull
request and push to `main`.
