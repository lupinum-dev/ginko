---
'@lupinum/ginko-server': minor
'@lupinum/ginko': patch
---

Change a draft without a time to save with empty required fields or too long texts: creating, saving, copying, undoing and releasing it refuse only values that are not well formed (a date that is no date, a time like 25:99, two list rows with one id) and return what is missing as warnings, while going online or getting a time still checks everything.
