---
'@lupinum/ginko-docs': patch
---

Fix the build warnings of the docs layer about a missing blog, changelog or post page: they now name the line to write in the site file (`blog: '/blog'` in `pages`, `posts: '/blog/[slug]'` in `entries`).
