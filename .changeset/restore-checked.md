---
'@lupinum/ginko-server': patch
---

Fix restoring an online entry from the trash: it now comes back online only when its fields pass the check and its links lead somewhere, else it comes back as a draft and the history says why.
