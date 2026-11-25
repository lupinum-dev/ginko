---
'@lupinum/ginko-server': patch
---

Fix the upgrade of a timed change for a later day whose field changed online since it was saved: it now stays unpublished without a time, with a history line, as "Publish" with a day refuses it.
