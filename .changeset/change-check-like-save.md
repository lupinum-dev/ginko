---
'@lupinum/ginko': patch
'@lupinum/ginko-server': patch
---

Fix the check of dated changes: a day's changes are checked like a save of their fields on that day, so an end time before its start, a week that does not start on the site's first day and a second too long value of an already too long field are refused.
