---
'@lupinum/ginko-server': patch
---

Fix a stopped planned change restarted by another person with the old values kept: it now counts as holding several people's values, so staff cannot cancel it without a yes.
