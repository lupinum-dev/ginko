---
'@lupinum/ginko-server': minor
---

Remove a time on unpublished changes of an online entry and a yes for a time on a single request: a change for a later day is a dated change, `unpublish` of an online entry only takes it offline, and a migration turns existing times and `planned` values into dated changes and sets requests approved for a time back to open.
