---
'@lupinum/ginko-content': patch
---

Fix `ginko check` and the build hiding broken entries: a scheduling date that is not a valid `YYYY-MM-DD` date is now reported instead of leaving the entry out, a scheduled entry is checked like a published one, and a translation must have the same number of list rows as the main file
