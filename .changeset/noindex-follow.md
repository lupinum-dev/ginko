---
"@lupinum/ginko": patch
---

`useGinkoSeo({ noindex: true })` now writes `<meta name="robots" content="noindex, follow">` instead of `noindex, nofollow`: a page kept out of search results (a print version, a draft preview) no longer asks search engines to ignore its links to the pages that are indexed. Affects the print page of the menu feature (`templates/_features/menu/app/pages/menu/print.vue`).
