---
'@lupinum/ginko': patch
---

Fix `local:files-export`: a content file marked `draft: true` stays out of the export, as it stays out of the build, instead of making the import refuse every entry.
