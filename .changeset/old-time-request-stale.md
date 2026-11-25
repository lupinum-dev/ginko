---
'@lupinum/ginko-server': patch
---

Fix an open request from before dated changes to take a planned time off: a yes now marks it stale ("the time no longer exists") instead of taking the entry offline.
