---
"@lupinum/ginko-i18n": patch
---

Fix: one URL per page: doubled and trailing slashes redirect to the clean address (`//blog` and `/blog/` answer with a 301 to `/blog`).
