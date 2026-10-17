---
"@lupinum/ginko-docs": patch
---

Fix route links outside Markdown (nav, footer, banner, start page): they lead to the main-language page when the current language has no such doc, instead of a raw `$docs…` address.
