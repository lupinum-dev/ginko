---
'@lupinum/ginko': patch
'@lupinum/ginko-server': patch
---

Fix the check of a change for a later day letting a required field stay empty when the change makes it show: the whole entry is now checked before and after each day's changes.
