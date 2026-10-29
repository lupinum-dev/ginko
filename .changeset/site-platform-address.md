---
"@lupinum/ginko": minor
---

Add `platform` to `defineSite`: the hosted platform's address can live in `ginko.config.ts`, so `pnpm dev` reads the hosted content without an `.env` file, in every clone and worktree. `NUXT_PUBLIC_GINKO_PLATFORM` still overrides it, and `pnpm local:dev` sets it to the local platform.
