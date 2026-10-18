---
"@lupinum/ginko-docs": minor
---

Change the docs layer to draw icons itself instead of with @nuxt/icon: pages outside the docs no longer download an icon library (about 16 KB gzip less on every page of a site that embeds the docs), and docs pages load only the icons they use. Icon names work as before (any installed Iconify set, in content, `docs:` navigation and app.config); a name that is not installed now logs one build warning with its file. Remove the `icon` options from your nuxt.config if you set any.
