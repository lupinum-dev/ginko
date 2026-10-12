# Ginko

Ginko is a content system for Nuxt websites. A site lists its content types in `ginko.config.ts` and
reads its content from Markdown and data files in its own repository, or from the platform that
Lupinum hosts, where owners, staff and AI agents edit it together. Languages, SEO, sitemaps, search
and a link check come with it.

```bash
npm create ginko@latest my-site
cd my-site
npm install
npm run dev
```

Documentation: [ginko-docs.vercel.app](https://ginko-docs.vercel.app). Requirements: Node 22.18+, 24 or
26, and Nuxt 4.6+.

## Packages

| Package | What it does |
|---|---|
| [`@lupinum/ginko`](packages/ginko) | Config, field types, the Nuxt module and the `ginko` CLI |
| [`@lupinum/ginko-i18n`](packages/ginko-i18n) | Languages, translated URLs and message formats; also works without the rest of Ginko |
| [`@lupinum/ginko-content`](packages/ginko-content) | Markdown and data files as the content source |
| [`@lupinum/ginko-components`](packages/ginko-components) | Markdown components (callouts, tabs, cards, …) and a shadcn-vue registry |
| [`@lupinum/ginko-docs`](packages/ginko-docs) | A Nuxt layer for documentation sites |
| [`@lupinum/ginko-preset-gastro`](packages/ginko-preset-gastro) | Ready-made content types for restaurants: hours, menus, lunch, events |
| [`create-ginko`](packages/create-ginko) | `npm create ginko`: starts a new site |

The hosted platform lives here too, but is not published: `packages/ginko-server` (Convex backend),
`packages/ginko-studio` (the editing app), `packages/ginko-editor` (its rich text editor),
`packages/ginko-preset-agency`, and `apps/platform` (the host). `sites/` holds the demo sites and
`contracts/` their published schemas.

## Work on it

```bash
pnpm install
pnpm typecheck && pnpm test && pnpm check:contracts
pnpm e2e          # all sites in a browser, against a fake platform
pnpm check:pack   # packs the released packages, installs a new site from the tarballs, builds and serves it
```

The platform and Studio locally, on a local Convex backend (never a cloud deployment):

```bash
cd apps/platform && CONVEX_AGENT_MODE=anonymous npx convex dev   # keep it running
node --experimental-strip-types scripts/setup-local.ts           # once per new backend: env vars, signing key
node --experimental-strip-types scripts/push-local.ts             # the restaurant site (or: saas, docs, …)
node --experimental-strip-types scripts/seed-local.ts             # demo content, owner and cook invites
cd apps/platform && pnpm e2e                                       # Studio tests; starts Nuxt on 3100, the site on 3000
```

Docs for site developers: [sites/docs/content/docs](sites/docs/content/docs). The contract and the
design: [SPEC.md](SPEC.md), [V1.md](V1.md), [UI.md](UI.md), [CONTENT.md](CONTENT.md), [DESIGN.md](DESIGN.md). Releases:
[RELEASING.md](RELEASING.md).

## License

MIT © Lupinum OG
