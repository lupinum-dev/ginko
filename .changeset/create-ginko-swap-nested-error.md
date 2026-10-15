---
'create-ginko': patch
---

`--locales` with another main language now stops with the file and field named when it cannot read a nested field of a content file, instead of swapping the field as a whole without a word (which failed the site's build later).
