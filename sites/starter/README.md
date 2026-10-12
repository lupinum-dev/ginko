# Ginko starter

A neutral English site you copy to start your own Ginko site: pages, posts (with drafts), events and a notice banner. It uses only the generic Ginko API, no preset, no UI library and no web fonts.

```bash
pnpm install
pnpm dev        # http://localhost:3300
```

## Change the content model

Edit [`ginko.config.ts`](./ginko.config.ts). It lists the bricks (content types) and their fields: `settings`, `notice`, `pages`, `posts`, `events`. The pages in `app/pages` read them with `useGinko`, `useGinkoEntry` and `useGinkoQuery`; types come from the config.

## Edit the content

Every brick has `source: 'files'`: the content is Markdown with frontmatter in [`content/`](./content), so the site runs without an account. Posts marked `draft: true` show in dev only.

To let editors work in Ginko Studio instead, remove `source: 'files'` from a brick and connect the site to the platform. The seed content (a small community garden) is invented; the event dates are in the future when this starter was made, so update them.

## Learn more

[`packages/ginko` README](../../packages/ginko/README.md)
