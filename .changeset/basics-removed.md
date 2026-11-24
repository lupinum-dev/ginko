---
'@lupinum/ginko': minor
---

Remove `@lupinum/ginko/basics`: its rules and JSON-LD builders (`hoursOn`, `todayState`, `eventJsonLd`, `faqJsonLd`, `offerJsonLd`, `legalTypes` and the others) keep their names and are exported from `@lupinum/ginko/patterns`, and its brick functions are the patterns of the same name there, with three differences: `posts()` needs `authors` (the key of the brick of the authors; it was optional, default `'authors'`); `events()` and `jobs()` add a status line on the Today page (`{ next: 'when' }` and `{ count: true }`), so a site that moves to them gets that key in its stored model; `people({ route })` is `people({ pages: true })` plus a `people` line in `entries`. The option types (`BasicsOptions`, `PostsOptions` and the others) and `withoutFiles` are gone.
