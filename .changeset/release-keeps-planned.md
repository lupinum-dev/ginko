---
'@lupinum/ginko': patch
---

Change the schema check of a release to refuse removing a stored `planned`: the platform's update converts it, so a release before that update no longer leaves the planned prices unconverted.
