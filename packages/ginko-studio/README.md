# @lupinum/ginko-studio

> Internal: this package is not published to npm. It runs only on the Ginko platform that Lupinum hosts.

The Ginko platform UI as a [Nuxt layer](https://nuxt.com/docs/guide/going-further/layers): sign-in,
quick tasks, full editor, preview and history. It talks to the Convex backend in
[`@lupinum/ginko-server`](../ginko-server). `apps/platform` is the reference host.

## Use

`apps/platform` is the host. Its `nuxt.config.ts` only extends the layer:

```ts
export default defineNuxtConfig({
  extends: ['@lupinum/ginko-studio'],
})
```

The layer registers `@lupinum/better-convex-nuxt`, the sign-in client, the styles and the `noindex`
header. A small module in the layer points `#convex/api` at the generated API that
`@lupinum/ginko-server` ships in `convex/_generated`, so the host needs no codegen. The host takes over the
whole app: do not extend a website with this layer. For the Convex side and the deploy steps, see the
[`ginko-server` README](../ginko-server/README.md).

## Environment variables

Read at build and start time by the host (`--dotenv .env.local` in development). A production build stops
when `SITE_URL` or `CONVEX_SITE_URL` is missing; development uses the local defaults.

| Name | Purpose |
| --- | --- |
| `CONVEX_URL` (or `NUXT_PUBLIC_CONVEX_URL`) | Convex deployment URL. |
| `CONVEX_SITE_URL` | Convex HTTP actions URL. Sign-in goes there; `/bundle/**` is proxied to it. Development default `http://127.0.0.1:3211` (the local backend). |
| `SITE_URL` | Public origin of this UI. It must equal `SITE_URL` on the Convex deployment. Development default `http://localhost:3100`. |
| `BCN_AUTH_TRUSTED_CLIENT_IP_HEADER` | Required outside local development. Header that your host sets to the client IP (`x-real-ip` on Vercel). |
| `BCN_AUTH_PROXY_IP_SECRET` | Required outside local development. The same secret as on the Convex deployment. |
