---
'@lupinum/ginko-server': patch
---

Fix a plan that could not stop when its mail failed with an error that carries no data: the entry now stops and keeps its history row.
