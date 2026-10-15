---
"@lupinum/ginko": patch
---

Change the robots tag of `useGinkoSeo({ noindex: true })` to `noindex, follow`, so a page kept out of search results (the menu's print page in templates/_features/menu/app/pages/menu/print.vue, a draft) no longer tells search engines to ignore its links.
