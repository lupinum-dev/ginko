---
'@lupinum/ginko-server': patch
---

Fix the history of a save with a day: a field the save takes out of the planned change is listed as cancelled, the saved line names only the fields kept, and a save that empties the change is logged as a cancel.
