---
'@lupinum/ginko': minor
'@lupinum/ginko-content': minor
'@lupinum/ginko-server': minor
'@lupinum/ginko-studio': minor
'@lupinum/ginko-docs': minor
'@lupinum/ginko-preset-gastro': minor
'create-ginko': minor
---

Change a site to state what Ginko guessed before: a collection needs `listing: { title }` and, with more than one language, `untranslated: 'hide' | 'fallback'`; a navigation tree is `tree: { parent }`, with `label` and `badge` naming the fields of its short name and badge; a file brick names its text field with `body`; a brick without pages names the page its preview opens with `preview` (patterns through `extend`, which also takes `listing` and `untranslated`); every site states its week in day keys, `week: { firstDay: 'mo', workdays: ['mo', 'tu', 'we', 'th', 'fr'] }`, in place of `firstDayOfWeek`; task ids are checked, a collection has at most one `f.slug`, `timeZone` and `locales` have no default, a table with fixed rows is `f.rows(label, { rows: 'weekdays' | 'workdays' | [{ key, label }], fields })`, stored as one object per row (`{ mo: { … } }`), a removed row named in `retired` as `'brick.field.row': { drop: true }` (also a workday that leaves `week`) in place of a list with `min = max` and `unique` (`unique` is removed), and the stored model carries `format: 2`, so site and platform must run the same Ginko.
