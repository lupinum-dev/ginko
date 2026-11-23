# {{NAME}}

This folder runs the Ginko platform: the Studio, where people edit the content of Ginko websites, and its backend
on [Convex](https://www.convex.dev). The code comes from three packages (`@lupinum/ginko-studio`,
`@lupinum/ginko-server` and `@lupinum/ginko`), so this folder holds only their settings.

## Start it on your computer

```bash
npm install
npm run dev
```

`npm run dev` starts a local Convex backend (no Convex account needed) and the Studio on http://localhost:3100.
The first start downloads the backend, which can take a minute. Press Ctrl-C to stop both.
To see all output of the backend and the Studio from the start, run `npm run dev -- --verbose`.

npm is tested. With pnpm, keep `pnpm-workspace.yaml`: Convex needs the real folders of `nodeLinker: hoisted`.
yarn and bun are not tested.

## Sign in

1. Open http://localhost:3100 and enter `admin@example.test`.
2. The local backend sends no mail. The code appears in the terminal where `npm run dev` runs.
3. The platform has no site yet. Create the first one with "New site".

## Files

- `convex.json`: the backend functions come from `node_modules/@lupinum/ginko-server/convex/`.
- `nuxt.config.ts`: the Studio, as a Nuxt layer.
- `.env.local`: written by the local backend (its address and the sign-in secret). Do not commit it.

## Not covered yet

This version runs the platform on your computer only. Putting it online (a Convex deployment and a host for the
Studio) comes with the next version of `ginko-platform`.
