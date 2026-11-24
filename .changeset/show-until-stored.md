---
'@lupinum/ginko': minor
'@lupinum/ginko-server': minor
'@lupinum/ginko-preset-gastro': minor
'@lupinum/ginko-studio': patch
'@lupinum/ginko-content': patch
'@lupinum/ginko-docs': patch
'create-ginko': patch
---

Change the stored end of an entry from `visible: { mode: 'until', … }` to `showUntil: { field, plusDays?, thenDelete? }`, the shape the site file writes, and remove `mode: 'always'` and the `Visibility` type.
