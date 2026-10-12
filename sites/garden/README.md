# Garden demo

A demo of the generic Ginko API inside this repository: a small community garden with pages, posts (with
drafts), events and a notice banner. It uses no preset, no UI library and no web fonts. The root
`pnpm typecheck` checks it.

To start your own site, do not copy this folder (its `workspace:` dependencies only resolve inside this
repository). Run `npm create ginko@latest my-site` instead.

```bash
pnpm install
pnpm --filter @ginko-demo/garden dev   # http://localhost:3305
```

## Content model

[`ginko.config.ts`](./ginko.config.ts) lists the bricks and their fields: `settings`, `notice`, `pages`,
`posts`, `events`. The pages in `app/pages` read them with `useGinko`, `useGinkoEntry` and `useGinkoQuery`;
types come from the config.

Every brick has `source: 'files'`: the content is Markdown with frontmatter in [`content/`](./content), so
the site runs without an account. Posts marked `draft: true` show in dev only. The content is invented, and
past events drop out of the list by themselves.
