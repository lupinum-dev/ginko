---
'@lupinum/ginko': minor
'@lupinum/ginko-server': patch
---

Change the check of dated changes: an entry may have one change per day (two changes of one day are refused with "write them as one change"), and an import refuses more than 20 waiting changes or an entry that is too large once its changes apply.
