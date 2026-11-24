---
'@lupinum/ginko-server': patch
---

Fix the undo of an address change: the earlier address is reserved again and forwarded as before, and the undo is refused when another entry holds that address now.
