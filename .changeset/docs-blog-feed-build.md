---
"@lupinum/ginko-docs": patch
---

Fix the blog feeds of the docs layer (`/blog/rss.xml` and `/<locale>/blog/rss.xml`) answering 404 in a production build of a site that has its own `app/pages` folder.
