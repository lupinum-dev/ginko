---
'@lupinum/ginko-server': patch
'@lupinum/ginko-studio': patch
---

Fix the rights on an existing dated change: a yearly change is edited or moved through a task only when the task asks for "Jedes Jahr wiederholen", a holding change keeps whether it comes back every year, and a task that does not ask for a name keeps the change's name instead of dropping it.
