# create-ginko

Start a Nuxt site with [Ginko](https://github.com/lupinum-dev/ginko/tree/main/packages/ginko):

```bash
npm create ginko@latest my-site
cd my-site
npm install
npm run dev
```

The new site reads its content from Markdown in `content/` and needs no platform. To let an owner
edit a brick on the Ginko platform instead, remove `source: 'files'` from it in `ginko.config.ts`. See
[Platform and CLI](https://github.com/lupinum-dev/ginko/blob/main/sites/docs/content/docs/12.plattform-und-cli.en.md).

The sample site is English. `--locale de` creates it in German.

The site id (`site` in `ginko.config.ts`) comes from the folder name: lower case, every run of other characters
becomes `-`, at most 40 characters, and it must start with a letter. When the id differs from the folder name, the
command says so. Change `site` in `ginko.config.ts` if you want another id.

## Options

Write the options after `--`. npm keeps options before `--` for itself and passes on only their values; the
command then stops and shows the right form. pnpm, yarn and bun accept the same command.

```bash
npm create ginko@latest my-site -- --locale de
npm create ginko@latest my-restaurant -- --preset gastro
npm create ginko@latest my-docs -- --preset docs
```

| Option | Values | Default |
|---|---|---|
| `--preset <name>` (or `--preset=<name>`) | `gastro`, `docs` | the plain starter |
| `--locale <code>` (or `--locale=<code>`) | `en`, `de` | `en` |
| `-h`, `--help` | | |

The command always says which starter and language it used. An unknown option, preset or locale stops
with exit code 2 (a usage error, as in the `ginko` CLI) and creates nothing. A folder that exists and is not
empty stops with exit code 1.

## Presets

| Preset | Package | What the starter shows | Platform needed? |
|---|---|---|---|
| `gastro` | `@lupinum/ginko-preset-gastro` | Opening hours and a menu, both read from files | Only for the preset's other bricks (notices, lunch, events, gallery) and the owner's quick tasks. The starter itself runs without it. |
| `docs` | `@lupinum/ginko-docs` | The docs layer (navigation, search) with two pages in `content/docs/` | No |

Each preset is a small folder in `presets/` that is copied over `template/`; `presets/<name>-de` is its German
version. `template-de/` holds the German sample text of the plain starter.

## License

MIT © Lupinum OG
