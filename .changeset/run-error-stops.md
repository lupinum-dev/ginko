---
'@lupinum/ginko': patch
'@lupinum/ginko-server': patch
---

Fix a planned draft or dated change whose run hits an unexpected error: it now stops with the reason "failed" and says so, instead of failing silently and staying planned.
