---
'@lupinum/ginko-server': minor
'@lupinum/ginko': patch
---

Change a draft without a time to save with empty required fields or too long texts: creating, saving, copying, undoing and releasing it check only the shape of its values and return what is missing as warnings, while going online or getting a time still checks everything.
