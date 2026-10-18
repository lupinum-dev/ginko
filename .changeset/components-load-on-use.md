---
'@lupinum/ginko-components': patch
---

Fix every page downloading all Markdown components: a page now loads only the components its Markdown uses. On a page without Markdown components this is about 23 KB less script (gzip) and no idle prefetch of component files.
