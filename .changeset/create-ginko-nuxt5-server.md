---
'create-ginko': patch
---

Fix `--template` sites on Nuxt 5: the font preload plugin and the news feed now type-check, because they use `useServerHooks()` and a relative import of `ginko.config.ts`.
