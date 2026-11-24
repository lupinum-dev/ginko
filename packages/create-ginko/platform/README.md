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
3. The first start loads a demo site, "Demo", so you can edit at once. Delete it when you do not need it: Team ›
   Delete site. `npm run dev -- --no-demo` starts without it. Create your own sites with "New site".

## Files

- `convex.json`: the backend functions come from `node_modules/@lupinum/ginko-server/convex/`.
- `nuxt.config.ts`: the Studio, as a Nuxt layer.
- `.env.local`: written by the local backend (its address and the sign-in secret). Do not commit it.
- `vercel.json`: Vercel builds the project with `npm run build` (`ginko-platform build`). A production build deploys
  the backend first, then starts its data migrations, then builds the Studio.
- `ginko-platform.json`: written by `ginko-platform setup`: the production deployment and the Studio address. It
  holds no secret. `ginko-platform import --prod` imports into this deployment.

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
Convex puts the deployment in the team's default region (team settings in the Convex dashboard); `--region <name>`
chooses another, for example `--region eu`, and an unknown name makes Convex list the names the team can use.

Two steps stay by hand:

- **The Resend domain.** Resend sends only from a domain you verified there. Until then, sign-in mail does not arrive.
- **Your own domain.** Add it to the Vercel project, then run `npx ginko-platform setup --site-url https://<your domain>`.
  Setup changes the address on both sides and deploys again.

## Bring the content of a website

A Ginko website that keeps its content in files (`content/`) can move it into a site of this platform. In this order,
the live website keeps showing its files until the content is on the platform:

1. In the Studio, create the site with "New site". Its Team page shows the values that connect the website to it
   (`GINKO_PLATFORM`, `GINKO_KEY`).
2. In the website folder, save the content: `npx ginko files-export`. It writes the folder
   `ginko-export-<site>-files`.
3. On a new branch, for example `move-to-platform`, remove `source: 'files'` from every brick in `ginko.config.ts`.
   Commit, push the branch (not `main`), and release it by hand:
   `GINKO_BRANCH=move-to-platform GINKO_COMMIT=$(git rev-parse HEAD) npx ginko release`, with `GINKO_PLATFORM` and
   `GINKO_KEY` set. The release sends the schema; the import does not.
4. In this folder: `npx ginko-platform import <path to the export folder> --site <identifier> --prod`. Without
   `--prod`, it imports into the local backend of `npm run dev` (create the site there first, too).
5. Merge the branch into `main`. Its release and deploy now find the content on the platform.

Why a branch: `ginko release` releases only the newest commit of `GINKO_BRANCH` (default `main`), and the website
deploys from `main`. So the schema reaches the platform while the live website still reads its files. Between steps 3
and 5, a release from `main` fails (it would remove the moved bricks from the platform, which a release refuses), so
keep that time short. The import takes only a site without content.

Updates: raise the three `@lupinum/*` versions in `package.json` (always the same version), then run
`vercel deploy --prod`, or push when the Vercel project is connected to Git. The build deploys the backend and then
starts its data migrations. If you made `CONVEX_DEPLOY_KEY` in the Convex dashboard instead of with `setup`, give the
key the rights `deployment:deploy` and `deployment:functions:runInternalMutations`; without the second, the build only
warns and the migrations do not start.
