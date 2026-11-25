---
'@lupinum/ginko-server': patch
---

Fix staff cancelling a dated change through a task that could not have made it: a task that changes values from a day no longer ends a change for certain days, a task with an end no longer cancels a change for good, and a yearly change needs a task that asks for it.
