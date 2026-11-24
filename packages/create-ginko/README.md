# create-ginko

Start a Nuxt site with [Ginko](https://github.com/lupinum-dev/ginko/tree/main/packages/ginko):

```bash
npm create ginko@latest my-site
cd my-site
npm install
npm run dev
```

The new site reads its content from Markdown in `content/` and needs no platform. To let an owner
edit a brick on the Ginko platform instead, remove `source: 'files'` from it in `ginko.config.ts`,
and give the single's required fields a `default` or make them optional (`f.markdown`, `f.image` and `f.file` cannot have a default, so set `optional: true` on them). See
[Move a brick to the platform](https://ginko.lupinum.com/docs/move-a-brick-to-the-platform).

Without options it creates the plain starter in English; `--locales de` creates it in German.

The site id (`site` in `ginko.config.ts`) comes from the folder name: lower case, every run of other characters
becomes `-`, at most 40 characters, and it must start with a letter. When the id differs from the folder name, the
command says so. Change `site` in `ginko.config.ts` if you want another id.

## Options

Write the options after `--`. npm keeps options before `--` for itself and passes on only their values; the
command then stops and shows the right form. pnpm, yarn and bun accept the same command.

```bash
npm create ginko@latest my-site -- --template starter
npm create ginko@latest my-site -- --locales de
```

| Option | Values | Default |
|---|---|---|
| `--template <name>` (or `--template=<name>`) | a bundled template: `starter`, `restaurant`, `local-business`, `company`, `saas`, `nonprofit`, `events`, `portfolio`, `blog` or `docs` (see [Templates](https://ginko.lupinum.com/docs/templates)) | the plain starter |
| `--locales <codes>` (or `--locales=<codes>`) | the languages to keep, comma-separated; the first is the main language. A template offers its own languages (`--help` and the end of each run list them); the plain starter has `en` or `de`, one at a time. | all of the template's languages; `en` for the plain starter |
| `--preset <name>` | deprecated, use `--template`: `gastro`, `docs` | |
| `--locale <code>` | deprecated, use `--locales`: `en`, `de` | |
| `-h`, `--help` | | |

With `--template`, the command copies the template, keeps only the languages of `--locales` (their content files,
message files, addresses, the texts per language in `app/app.config.ts` and the labels of the bricks; the README gets
a line that names the languages of the copy), moves the dates of upcoming sample entries (such as events and notices) by
whole weeks to this week, sets the site id and writes a `.env` with `NUXT_APP_SECRET`.

The command always says which starter and languages it used. An unknown option, template, preset or locale stops
with exit code 2 (a usage error, as in the `ginko` CLI) and creates nothing. A folder that exists and is not
empty stops with exit code 1.

## A platform project

`--platform` creates a folder that runs the Ginko platform, the Studio and its backend, instead of a site:

```bash
npm create ginko@latest my-cms -- --platform
cd my-cms
npm install
npm run dev
```

`npm run dev` runs `ginko-platform dev`: a local Convex backend (no Convex account needed) and the Studio on
http://localhost:3100. Sign in as `admin@example.test`; the sign-in code appears in the terminal.
`npm run dev -- --verbose` shows all output of the backend and the Studio from the start. The folder holds
`package.json` (`@lupinum/ginko`, `@lupinum/ginko-server` and `@lupinum/ginko-studio` at this release's version),
`nuxt.config.ts`, `convex.json` (the functions come from `node_modules/@lupinum/ginko-server/convex/`),
`pnpm-workspace.yaml` (pnpm must install with `nodeLinker: hoisted`), `.gitignore` and a `README.md`. npm is tested;
yarn and bun are not. `--platform` takes no other option. Putting the platform online comes with a later version.

## Presets (deprecated)

`--preset` still works for now and prints a note; use `--template` instead.

| Preset | Package | What the starter shows | Platform needed? |
|---|---|---|---|
| `gastro` | `@lupinum/ginko-preset-gastro` | Opening hours and a menu, both read from files | Only for the preset's other bricks (notices, lunch, events, gallery) and the owner's quick tasks. The starter itself runs without it. |
| `docs` | `@lupinum/ginko-docs` | The docs layer (navigation, search) with two pages in `content/docs/` | No |

Each preset is a small folder in `presets/` that is copied over `template/`; `presets/<name>-de` is its German
version. `template-de/` holds the German sample text of the plain starter.

## License

MIT © Lupinum OG
