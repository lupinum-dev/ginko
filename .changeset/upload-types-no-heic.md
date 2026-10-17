---
"@lupinum/ginko": patch
---

Remove HEIC from the accepted upload types (`UPLOAD_TYPES`): the Files library cannot read HEIC photos. `local:files-export` now names a HEIC photo and says how to save it as JPEG.
