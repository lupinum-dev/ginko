---
'@lupinum/ginko': minor
'@lupinum/ginko-content': minor
'@lupinum/ginko-server': minor
---

Change the bundle to leave out entries that ended (`showUntil`), on the platform and in files alike; server routes such as `llms.txt`, the Markdown pages and `getGinkoItems` filter by the site's day at the request, and the agent tool `ginko_read` leaves them out too (`ginko_search` finds them).
