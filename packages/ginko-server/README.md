# @lupinum/ginko-server

> Internal: this package is not published to npm. It runs only on the Ginko platform that Lupinum hosts.

The Ginko platform backend for [Convex](https://convex.dev): sites, entries, releases, uploads and
sign-in (Better Auth). It ships its Convex source in `convex/`; Convex bundles it when a host deploys.
Together with [`@lupinum/ginko-studio`](../ginko-studio) it forms the platform. `apps/platform` is the
reference host.

## Host a platform

A host is a small app that holds the deployment settings and no code.

```bash
pnpm add @lupinum/ginko-server convex
```

Point the host's `convex.json` at the package, then run the Convex CLI in the host folder:

```json
{
  "functions": "node_modules/@lupinum/ginko-server/convex/",
  "node": { "externalPackages": ["sharp"] }
}
```

In this monorepo the path is `../../packages/ginko-server/convex/`. Function names stay the same
(`api.sites.get` and so on), so existing deployments and data stay valid.

## Image variants (srcset)

New image uploads get WebP copies at 480, 960 and 1600 px wide (only those narrower than the image). Images
uploaded before that have none; make them once per deployment with `npx convex run images:backfillVariants`
(add `--prod` for production). It works through 20 files at a time and schedules itself until all are done;
running it again is safe.

## Environment variables

Set them in the Convex deployment (not in the host's `.env.local`).

| Name | Purpose |
| --- | --- |
| `SITE_URL` | Public origin of the platform UI. Used for sign-in and invite links. |
| `GINKO_ADMIN_EMAILS` | Comma-separated addresses. The first sign-in with one of them makes an admin. |
| `GINKO_MAIL` | How mail is sent: `resend` (hosted) or `outbox` (local and test sink). |
| `GINKO_MAIL_FROM` | Sender address for mail sent through Resend. |
| `RESEND_API_KEY` | API key for Resend when `GINKO_MAIL=resend`. |
| `GINKO_PLATFORM_ORIGIN` | Origin of the UI that may upload files (CORS). Default `http://localhost:3100`. |
| `GINKO_LOCAL` | `1` only on a local deployment: enables the demo seed and `devPush`. Never set it on a hosted one. |

## Tests

`pnpm exec vitest run --project convex` from the repo root runs the tests in `test/` with `convex-test`.
