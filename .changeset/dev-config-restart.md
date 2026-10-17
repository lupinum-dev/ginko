---
"@lupinum/ginko": patch
---

Fix `nuxt dev` ignoring changes to `ginko.config.ts`: a saved change now restarts the dev server, and a save with an error is reported in the terminal while the site keeps running with the last good version.
