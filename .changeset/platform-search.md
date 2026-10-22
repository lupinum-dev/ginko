---
'@lupinum/ginko': patch
'@lupinum/ginko-docs': patch
---

Add site search for platform content: on a site with platform bricks, `/__ginko/search/<locale>.json` (the docs search box and `search_docs`) is built from the published content and renewed like a page, so a page published in the Studio is found within a minute. Expired entries are left out.
