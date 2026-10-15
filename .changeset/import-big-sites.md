---
"@lupinum/ginko": patch
---

Fix `local:import` for big and inconsistent exports: it refuses a collection over its maximum, an entry ID twice or two entries at one address before it clears anything, imports thousands of entries and references in smaller calls, prints no schema warning when there is none, and suggests running it again only when that can finish.
