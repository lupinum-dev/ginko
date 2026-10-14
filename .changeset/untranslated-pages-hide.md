---
"@lupinum/ginko": minor
---

Change the default of `untranslated` for collections with a `route`: an entry is left out of a language until its required fields are translated there (no page, a 404 under its address, not in lists, the sitemap, hreflang or llms.txt); set `untranslated: 'fallback'` to list it there with a link to its main-language page.

An outdated translation no longer hides anything, also with `'hide'`; only a missing one does. Collections without a `route` (authors, FAQ, dishes) keep `'fallback'` as their default. A missing slug or image description never counts as a missing translation. A link to an entry (`$blog.<name>`) in a translated text goes to its main-language page while the entry has no page in that language.
