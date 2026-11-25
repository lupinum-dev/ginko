---
'@lupinum/ginko': patch
---

Fix a file entry's `$publishAt` with a day alone where the clock jumps at midnight (Havana's summer time): it now starts at the first instant of that day, not an hour before it.
