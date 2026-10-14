---
"@lupinum/ginko-i18n": patch
---

Fix: a page address in another case redirects to its own spelling (`/Blog` answers with a 301 to `/blog`), and the canonical link uses that spelling.
