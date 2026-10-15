---
"@lupinum/ginko": patch
---

Fix local imports on a busy machine: Convex's "Function execution timed out" is now read from `convex run` and the import tries again (up to three times, with growing waits).
