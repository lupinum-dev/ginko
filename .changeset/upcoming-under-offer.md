---
'@lupinum/ginko': patch
---

Fix `upcoming` announcing a change for good on its own day while a change for certain days still covers that field: each field is now announced for the first day it really shows, and left out when a later change takes it over first.
