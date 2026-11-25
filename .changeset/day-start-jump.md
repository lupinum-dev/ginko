---
'@lupinum/ginko-server': patch
---

Fix dated changes in time zones whose clock jumps from midnight to 01:00: the change now starts at the jump instead of planning its run again without end.
