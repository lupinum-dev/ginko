---
'@lupinum/ginko': minor
---

Change images from the platform to load from the site's own address (`/__ginko/file/…`) instead of the storage host, so a backend move cannot break images in caches and search results; JSON-LD image addresses are now absolute.
