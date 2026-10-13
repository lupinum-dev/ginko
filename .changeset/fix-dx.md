---
"@lupinum/ginko": patch
"create-ginko": patch
---

Fewer traps for a new site. In dev, a brick that reads from the platform names itself, the address tried and the fix (`source: 'files'`) when the platform is not running. `nuxt dev` restarts when `ginko.config.ts` changes. `ginko check` reports a `seo.image` path that is missing from `public/`. The `@lupinum/ginko` README example now works in a new site. Starters from create-ginko install with pnpm 11 without an error (`pnpm-workspace.yaml` allows esbuild's install script), declare `engines.node`, have a page title and description, and a `typecheck` script with `vue-tsc`. create-ginko warns on an unsupported Node version before it starts.
