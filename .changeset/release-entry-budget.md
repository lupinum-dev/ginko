---
"@lupinum/ginko": patch
---

Fix `ginko check` and `ginko release` refusing a release because of an entry the release does not change or one in the trash: only live entries the release writes, and only when they grow, must fit the entry limit (480 KiB, counted without Markdown trees), and the message names the entry.
