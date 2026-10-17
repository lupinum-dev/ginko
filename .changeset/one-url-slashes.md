---
"@lupinum/ginko-i18n": patch
---

Fix doubled and trailing slashes: `//blog` and `/blog/` now answer with a 301 to `/blog`, so every page has one URL.
