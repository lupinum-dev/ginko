# @lupinum/ginko-studio

> Internal: this package is not published to npm. It runs only on the Ginko platform that Lupinum hosts.

The Ginko platform UI as a [Nuxt layer](https://nuxt.com/docs/guide/going-further/layers): sign-in,
quick tasks, full editor, preview and history. It talks to the Convex backend in
[`@lupinum/ginko-server`](../ginko-server). `apps/platform` is the reference host.

## Use

```bash
pnpm add @lupinum/ginko-studio @lupinum/ginko-server @lupinum/better-convex-nuxt nuxt vue convex
```

```ts
// nuxt.config.ts of the host
export default defineNuxtConfig({
  extends: ['@lupinum/ginko-studio'],
})
```

The layer registers `@lupinum/better-convex-nuxt`, the sign-in client, the styles and the `noindex`
header. A small module in the layer points `#convex/api` at the generated API in
`@lupinum/ginko-server` (the Convex module would otherwise look for `convex/` in the host). Run
`npx convex codegen` in the host once so that file exists.

## Environment variables

Read at build and start time by the host (`--dotenv .env.local` in development).

| Name | Purpose |
| --- | --- |
| `CONVEX_URL` (or `NUXT_PUBLIC_CONVEX_URL`) | Convex deployment URL. |
| `CONVEX_SITE_URL` | Convex HTTP actions URL. Sign-in goes there; `/bundle/**` is proxied to it. |
| `SITE_URL` | Public origin of this UI. Defaults to `http://localhost:3000`. |
| `BCN_AUTH_TRUSTED_CLIENT_IP_HEADER` | Optional. Header that carries the client IP behind a proxy (rate limits). |
| `BCN_AUTH_PROXY_IP_SECRET` | Optional. Shared secret that proves the proxy set that header. |
