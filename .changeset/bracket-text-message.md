---
"@lupinum/ginko": patch
---

Fix the message for text in square brackets that is no link or image (`![Bild(datei)` or `[sic]`): it now names the missing "]" or address and how to write brackets as text, instead of reporting an unknown component "span".
