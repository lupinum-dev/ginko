---
'@lupinum/ginko': patch
'@lupinum/ginko-studio': patch
---

Fix a draft with only one day of a period: the missing day is a warning while it stays a draft and an error when it goes online, and the Studio no longer sends an empty day.
