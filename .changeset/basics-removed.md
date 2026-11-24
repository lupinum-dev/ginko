---
'@lupinum/ginko': minor
---

Remove `@lupinum/ginko/basics`: its rules and JSON-LD builders (`hoursOn`, `todayState`, `eventJsonLd`, `faqJsonLd`, `offerJsonLd`, `legalTypes` and the others) keep their names and are exported from `@lupinum/ginko/patterns`, its brick functions are the patterns of the same name there; the option types (`BasicsOptions`, `PostsOptions` and the others) and `withoutFiles` are gone.
