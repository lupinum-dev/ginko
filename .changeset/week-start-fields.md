---
"@lupinum/ginko": patch
---

Fix a week saved as a mid-week day (a lunch week from Thursday) being accepted although the site never shows it: the field that holds a week start (`plans.field`, or the date a task presets to `@workWeek` or `@nextWorkWeek`) now needs the first day of a week, also in content files.
