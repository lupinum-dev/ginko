---
'@lupinum/ginko-server': patch
---

Fix importing a planned entry whose time has passed: it now comes back as a stopped draft instead of going online at once, and the export keeps a stopped plan.
