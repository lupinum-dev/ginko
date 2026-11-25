---
'@lupinum/ginko-server': patch
---

Fix moving a dated change to another day: a field it no longer sets also lets go of its file, so the file can be cleaned up later.
