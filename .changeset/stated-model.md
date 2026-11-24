---
'@lupinum/ginko': minor
'@lupinum/ginko-content': minor
'@lupinum/ginko-server': minor
'@lupinum/ginko-studio': minor
'@lupinum/ginko-docs': minor
'@lupinum/ginko-preset-gastro': minor
'create-ginko': minor
---

Change a site to state what Ginko guessed before: a collection needs `listing: { title }` and, with more than one language, `untranslated: 'hide' | 'fallback'`; a navigation tree is `tree: { parent }`; a file brick names its text field with `body`; a site with a weekly brick states `week: { firstDay, workdays }` in place of `firstDayOfWeek`; task ids are checked, a collection has at most one `f.slug`, `timeZone` and `locales` have no default, and the stored model carries `format: 2`, so site and platform must run the same Ginko.
