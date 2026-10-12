# create-ginko

Start a Nuxt site with [Ginko](https://github.com/lupinum-dev/ginko/tree/main/packages/ginko):

```bash
npm create ginko my-site
cd my-site
npm install
npm run dev
```

The new site reads its content from Markdown in `content/` and needs no platform. To let an owner
edit a brick on the Ginko platform instead, remove `source: 'files'` from it in `ginko.config.ts` and
give its `f.markdown` field the profile an owner should get, e.g. `{ profile: 'basic' }`. See
[Platform and CLI](https://github.com/lupinum-dev/ginko/blob/main/sites/docs/content/docs/9.plattform-und-cli.en.md).

## Start from a preset

`--preset` starts the site from a Ginko preset instead of the plain starter (`--preset=docs` works too):

```bash
npm create ginko my-restaurant -- --preset gastro
npm create ginko my-docs -- --preset docs
```

| Preset | Package | What the starter shows | Platform needed? |
|---|---|---|---|
| `gastro` | `@lupinum/ginko-preset-gastro` | Opening hours and a menu, both read from files | Only for the preset's other bricks (notices, lunch, events, gallery) and the owner's quick tasks. The starter itself runs without it. |
| `docs` | `@lupinum/ginko-docs` | The docs layer (navigation, search) with two pages in `content/docs/` | No |

The sample text is neutral English. An unknown preset name stops with an error that lists the two names.
Each preset is a small folder in `presets/` that is copied over `template/`.

## License

MIT © Lupinum OG
