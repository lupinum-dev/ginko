# @lupinum/ginko-server

> Internal: this package is not published to npm. It runs only on the Ginko platform that Lupinum hosts.

The Ginko platform backend for [Convex](https://convex.dev): sites, entries, releases, uploads and
sign-in (Better Auth). It ships its Convex source in `convex/`; Convex bundles it when a host deploys.
Together with [`@lupinum/ginko-studio`](../ginko-studio) it forms the platform. `apps/platform` is the
reference host.

## Deploy the platform (Lupinum operators)

This package is the Convex project: its `convex.json` points the Convex CLI at `convex/` (with `sharp` as an
external package). `apps/platform` is the host for the UI; it extends `@lupinum/ginko-studio`. Function names
stay the same (`api.sites.meta` and so on), so existing deployments and data stay valid.

Run every `npx convex` command of the platform in `packages/ginko-server`, never in another folder. The Convex CLI
keeps `sharp` out of the bundle only when it runs next to the `package.json` that lists it; from `apps/platform` it
bundles `sharp`, and the deploy fails on Convex's Linux runtime.

1. Set the Convex environment variables (table below) on the deployment, for example
   `npx convex env set --prod SITE_URL https://platform.example`.
2. Deploy the functions from `packages/ginko-server`. The environment variable names the target and wins over
   the local `.env.local` in that folder:
   `cd packages/ginko-server && CONVEX_DEPLOYMENT=prod:<deployment name> npx convex deploy`.
3. Create the auth signing key once: `npx convex run --prod auth:ensureSigningKey`.
4. Set the UI's environment variables (see the [`ginko-studio` README](../ginko-studio/README.md)) and deploy
   `apps/platform` (Vercel). `SITE_URL` and `BCN_AUTH_PROXY_IP_SECRET` must be the same on both sides, or
   sign-in fails with 403.
5. For each new site:
   - `npx convex run --prod sites:bootstrap '{"slug":"linde","name":"Gasthaus zur Linde","url":"https://linde.example"}'`
   - `npx convex run --prod release:bootstrapKey '{"site":"linde","label":"CI","scopes":["release","check","pull","export"]}'`
     prints the push key once. It goes into the site's CI as `GINKO_KEY`. To revoke a leaked key, find its id
     with `release:pushKeys '{"site":"linde"}'` (it also shows `lastUsedAt`, stamped at most once an hour) and run
     `release:revokePushKeyAsOperator '{"key":"<id>"}'`. Owners and admins see the live keys on the Studio's Team
     page and can revoke them there.
   - `npx convex run --prod sites:setRefreshToken '{"slug":"linde","token":"<NUXT_GINKO_REVALIDATE_TOKEN of the site>"}'`
     (at least 32 characters). "Update website now" sends it to the site. A bundle request that carries it
     in `x-ginko-site-token` is not counted in the public rate limit.
6. Sign in once with an address from `GINKO_ADMIN_EMAILS`: that makes the first admin, who invites owners.

## Image variants (srcset)

New image uploads get WebP copies at 480, 960 and 1600 px wide (only those narrower than the image). Images
uploaded before that have none; make them once per deployment with `npx convex run images:backfillVariants`
(add `--prod` for production). It works through 20 files at a time and schedules itself until all are done;
running it again is safe.

## Markdown trees

Every live entry stores the parsed trees of its Markdown texts in the `entryTrees` table, so the public bundle parses
nothing. An entry keeps the trees of the parser it was saved with. After an update that changes the parser's output
(comark, its plugins or Ginko's Markdown rules), write them again once per deployment with
`npx convex run entries:migrateStorage` (add `--prod` for production). It works through 10 entries at a time and
schedules itself until all are done, then recounts every site's byte counters; running it again is safe.
`npx convex run entries:storageStatus` checks the result, one site per call (pass the returned `cursor`).

## Environment variables

Set them in the Convex deployment (not in `.env.local`).

| Name | Purpose |
| --- | --- |
| `SITE_URL` | Public origin of the platform UI, the same value as the UI's `SITE_URL`. Used for sign-in, mail links and the upload CORS check. |
| `BETTER_AUTH_SECRETS` | Required. Signing secrets for sessions, as `<version>:<secret>` (for example `0:` and 64 hex characters). |
| `BCN_AUTH_PROXY_IP_SECRET` | Required. The same secret as in the UI: it proves that the UI set the client IP header. |
| `GINKO_ADMIN_EMAILS` | Comma-separated addresses. The first sign-in with one of them makes an admin. |
| `GINKO_MAIL` | How mail is sent: `resend` (hosted) or `outbox` (local and test sink). |
| `GINKO_MAIL_FROM` | Sender address for mail sent through Resend. |
| `RESEND_API_KEY` | API key for Resend when `GINKO_MAIL=resend`. |
| `GINKO_LOCAL` | `1` only on a local deployment: enables the demo seed and `devPush`. Never set it on a hosted one. |

## Local backend

`pnpm --filter @ginko/platform convex` starts `convex dev` in this folder against an anonymous local backend (no
account, no cloud). It writes the deployment and its URLs to `packages/ginko-server/.env.local` (git-ignored); the
scripts in `scripts/` and `apps/platform` (`pnpm dev`, the e2e tests) read that one file. State lives in
`packages/ginko-server/.convex`.

## Tests

`pnpm exec vitest run --project convex` from the repo root runs the tests in `test/` with `convex-test`.
