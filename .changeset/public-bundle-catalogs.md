---
"@lupinum/ginko": patch
---

Fix sites downloading Ginko's message catalogs on every page: the texts of the Studio and the preview in six languages (about 20 KB gzip) were part of a site's main script whenever its pages used Ginko's composables, though only the preview page shows them. They now load with the preview page only.
