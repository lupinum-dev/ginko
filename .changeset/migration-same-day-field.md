---
'@lupinum/ginko-server': patch
---

Fix the upgrade of a timed change whose day already has a planned value for the same field: it now stays unpublished without a time, with a history line, instead of replacing the planned value.
