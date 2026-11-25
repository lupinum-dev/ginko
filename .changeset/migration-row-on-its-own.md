---
'@lupinum/ginko-server': patch
---

Fix the dated-changes migration stopping a whole site at one timed unpublished change it cannot convert: that change now stays unpublished without a time, with a history line, and the rest of the site is converted.
