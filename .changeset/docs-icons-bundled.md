---
"@lupinum/ginko-docs": minor
"@lupinum/ginko-components": patch
---

Change the docs layer to draw icons itself instead of with @nuxt/icon: pages outside the docs no longer download an icon library (about 16 KB gzip less on every page of a site that embeds the docs), and docs pages load only the icons they use. Icon names work as before (any installed Iconify set). The build finds them in your Markdown front matter and component attributes (not in prose or code blocks), in YAML and JSON content, in `app.config.ts` and in your own `app/` components (`<Icon name="lucide:x" />`); it reads all locales and ignores commented-out code. A name built at runtime (a variable) is not found, so write it once as a literal; a name that is not installed logs one build warning with its file. A site's own `@nuxt/icon` still wins over the layer's `Icon`. Remove the `icon` options from your nuxt.config if you set any. The icon hints in the editor now say "needs a global Icon component".
