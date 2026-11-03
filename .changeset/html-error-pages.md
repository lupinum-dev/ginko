---
"@lupinum/ginko": patch
---

Fix missing pages showing raw JSON on Vercel: when curl, a monitor or a bot requested a missing address first, the page cache kept Nuxt's JSON error and served it to every browser. A cached address now always answers an error with the site's error page as HTML; `/api/`, `.json` addresses and `/__ginko/` keep Nuxt's choice.
