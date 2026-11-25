---
'@lupinum/ginko-server': patch
---

Fix the upgrade of a planned value whose day is not a date: it is now dropped as no plan, instead of going online at once.
