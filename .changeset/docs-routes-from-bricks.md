---
"@lupinum/ginko-docs": patch
---

Fix the docs layer adding a second blog, blog feed or changelog at /blog and /changelog to a site that has its own: it now adds them only at the address of your posts and changelog and only when you have no page there.

A changelog page needs `changelog: changelogPages({ locales })` in `pages` (or a `route` on the changelog brick); without an address the build warns once and the layer adds no changelog. The layer now decides after all of your pages are known, so a page that the page-paths module moves to `/blog` also counts as yours, and its links to the blog and changelog follow the addresses you configured.
