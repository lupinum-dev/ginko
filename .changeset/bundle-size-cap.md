---
"@lupinum/ginko": patch
---

Fix a site refusing its own content as "bundle too large" when its texts are heavily formatted: the size limit now covers everything the platform allows (4 MiB of text plus 8 MiB of Markdown trees).
