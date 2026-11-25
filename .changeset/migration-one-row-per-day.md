---
'@lupinum/ginko-server': patch
---

Fix the dated-changes migration making two rows for one day when a planned value and another change share that day: they now join into one change.
