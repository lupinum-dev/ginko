---
"@lupinum/ginko-i18n": patch
---

Fix `localePath` giving a dead link when a catch-all page matched the path first.

On a site with a `[...slug].vue` page, `localePath('/menu/print')` returned `/menu/print` where the print page's address in the main language is `/speisekarte/drucken`. It now returns the page's address. The restaurant template's link "Speisekarte drucken" was a 404 on sites with German as the main language.
