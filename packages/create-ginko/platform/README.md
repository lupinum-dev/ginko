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
- `vercel.json`: Vercel builds the project with `npm run build` (`ginko-platform build`). A production build deploys
  the backend first, then starts its data migrations, then builds the Studio.
- `ginko-platform.json`: written by `ginko-platform setup`: the production deployment and the Studio address. It
  holds no secret.

## Put it online

The backend runs on Convex, the Studio on Vercel, and sign-in mail goes through [Resend](https://resend.com). You
need an account at each. Log in to both command-line tools once:

```bash
npx convex login
npm install --global vercel
vercel login
```

Then, in this folder:

```bash
npx ginko-platform setup
```

It asks for four things: the Studio address (press Enter to use the address Vercel gives the project), the admin
email (this address may sign in first), the Resend API key (the input is hidden) and the sender address for sign-in
mail, for example `Studio <login@example.com>`. Then it creates a Convex project with a production deployment and a
Vercel project, sets their values (secrets never appear on screen), deploys, and prints the address. Your local
backend for `npm run dev` stays as it is.

`npx ginko-platform setup --dry-run` prints every step and its command first, and changes nothing. Setup is safe to
run again: it reuses what exists, sets only what is missing and never replaces a secret.
`--team <slug>` is the Convex team; on Vercel, setup uses the scope the Vercel CLI has selected (`vercel switch`).

Two steps stay by hand:

- **The Resend domain.** Resend sends only from a domain you verified there. Until then, sign-in mail does not arrive.
- **Your own domain.** Add it to the Vercel project, then run `npx ginko-platform setup --site-url https://<your domain>`.
  Setup changes the address on both sides and deploys again.

Updates: raise the three `@lupinum/*` versions in `package.json` (always the same version), then run
`vercel deploy --prod`, or push when the Vercel project is connected to Git.
