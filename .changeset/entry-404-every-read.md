---
"@lupinum/ginko": patch
---

Fix a missing entry from useGinkoEntry showing the last entry instead of the 404 when other code, such as useGinkoMarkdown, read it first; it now throws on every read and is a `Readonly<Ref>`.
