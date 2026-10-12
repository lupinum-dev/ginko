# @lupinum/ginko-server

> Internal: this package is not published to npm. It runs only on the Ginko platform that Lupinum hosts.

The Ginko platform backend for [Convex](https://convex.dev): sites, entries, releases, uploads and
sign-in (Better Auth). It ships its Convex source in `convex/`; Convex bundles it when a host deploys.
Together with [`@lupinum/ginko-studio`](../ginko-studio) it forms the platform. `apps/platform` is the
reference host.

## Deploy the platform (Lupinum operators)

`apps/platform` is the host: its `convex.json` points the Convex CLI at `../../packages/ginko-server/convex/`
(with `sharp` as an external package), and it extends `@lupinum/ginko-studio` for the UI. Function names stay
the same (`api.sites.get` and so on), so existing deployments and data stay valid.

1. Set the Convex environment variables (table below) on the deployment, for example
   `npx convex env set --prod SITE_URL https://platform.example`.
2. Deploy the functions from `apps/platform`: `npx convex deploy`.
3. Create the auth signing key once: `npx convex run --prod auth:ensureSigningKey`.
4. Set the UI's environment variables (see the [`ginko-studio` README](../ginko-studio/README.md)) and deploy
   `apps/platform` (Vercel). `SITE_URL` and `BCN_AUTH_PROXY_IP_SECRET` must be the same on both sides, or
   sign-in fails with 403.
5. For each new site:
   - `npx convex run --prod sites:bootstrap '{"slug":"linde","name":"Gasthaus zur Linde","url":"https://linde.example"}'`
   - `npx convex run --prod release:bootstrapKey '{"site":"linde","label":"CI","scopes":["release","check","pull","export"]}'`
     prints the push key once. It goes into the site's CI as `GINKO_KEY`. To revoke a leaked key, find its id
     with `release:pushKeys '{"site":"linde"}'` and run `release:revokePushKeyAsOperator '{"key":"<id>"}'`.
   - `npx convex run --prod sites:setRefreshToken '{"slug":"linde","token":"<NUXT_GINKO_REVALIDATE_TOKEN of the site>"}'`
     (at least 32 characters). "Update website now" sends it to the site. A bundle request that carries it
     in `x-ginko-site-token` is not counted in the public rate limit.
6. Sign in once with an address from `GINKO_ADMIN_EMAILS`: that makes the first admin, who invites owners.

## Image variants (srcset)

New image uploads get WebP copies at 480, 960 and 1600 px wide (only those narrower than the image). Images
uploaded before that have none; make them once per deployment with `npx convex run images:backfillVariants`
(add `--prod` for production). It works through 20 files at a time and schedules itself until all are done;
running it again is safe.

## Environment variables

Set them in the Convex deployment (not in the host's `.env.local`).

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

## Tests

`pnpm exec vitest run --project convex` from the repo root runs the tests in `test/` with `convex-test`.
