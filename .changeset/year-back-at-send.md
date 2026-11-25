---
'@lupinum/ginko-server': patch
---

Fix a request for a yearly change that starts a year back: the limit is checked when the request is sent, so a yes some days later no longer refuses it.
