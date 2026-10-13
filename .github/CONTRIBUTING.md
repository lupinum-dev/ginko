# Contributing to Ginko

Thanks for helping. For a bug fix or a small improvement, open a pull request. For a larger change
(a new feature, a new brick type, a change to a public contract), open an issue first so we can agree
on the direction before you write code.

## Set up

You need Node.js `^22.19 || ^24.11` (see `engines` in `package.json`) and pnpm (the version in
`packageManager`; `corepack enable` installs it).

```bash
git clone https://github.com/lupinum-dev/ginko.git
cd ginko
pnpm install
```

The repository is a pnpm workspace: published packages in `packages/`, demo sites in `sites/`, the
hosted platform in `apps/platform`.

## Checks

Run these before you open a pull request. CI runs the first four.

```bash
pnpm typecheck         # types in all packages and sites
pnpm test              # unit tests (vitest)
pnpm check:contracts   # the schemas the demo sites publish
pnpm check:pack        # packs the released packages and builds a new site from the tarballs
pnpm e2e               # browser tests (Playwright); run it when you change UI or site behavior
```

The platform e2e tests need a local Convex backend; see the README.

## Commits and changesets

- Use [Conventional Commits](https://www.conventionalcommits.org/), for example
  `fix(content): keep the slug of a renamed file`.
- If your change affects a published package, add a changeset with `pnpm changeset`. Describe the
  change for the people who use the package. Tooling, tests and docs-only changes need none.
- Keep one topic per pull request. Fill in the pull request template.

How releases work: [RELEASING.md](../RELEASING.md).

## Security

Do not report vulnerabilities in a public issue. See [SECURITY.md](SECURITY.md).
