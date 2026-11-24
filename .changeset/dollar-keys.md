---
'@lupinum/ginko': minor
'@lupinum/ginko-content': minor
'@lupinum/ginko-docs': minor
'create-ginko': minor
---

Change the keys of a content file that are no fields to start with `$`: `$draft: true` and `$redirectFrom` replace `draft` and `redirectFrom` (now free field names), an unknown `$` key is an error, `$publishAt: 2026-12-01T09:00` puts an entry online at a time in the site's time zone while a date field in the future no longer hides it, a collection may name its date field in `publishedOn` (the posts and changelog patterns do, and `ginko check` notes a date that does not fit `$publishAt`), `ginko check` notes each entry whose `$publishAt` is still to come (it needs a build that day), and an entry's `data` no longer carries `draft` or `redirectFrom`.
