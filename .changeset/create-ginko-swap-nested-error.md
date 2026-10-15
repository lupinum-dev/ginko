---
'create-ginko': patch
---

Fix `--locales` with another main language: a nested content field it cannot read now stops the copy with the file and field named, instead of being swapped whole and failing the site's build later.
