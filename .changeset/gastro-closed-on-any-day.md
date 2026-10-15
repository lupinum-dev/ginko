---
"@lupinum/ginko-preset-gastro": minor
---

Change "Heute geschlossen" to work for any single day: the field is now labelled "Geschlossen am" with hints, and `upcomingClosures` lists a `closedOn` day after today, so the site announces tomorrow's closure. Each owner closure it returns has `field`, the bundle path of its reason. `closedOnClosure(hours, today)` gives that day alone, for a list without the days limit.
