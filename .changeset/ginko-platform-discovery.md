---
'@lupinum/ginko': minor
---

Change `GINKO_PLATFORM` to accept the Studio's address: `ginko release`, `check` and `export` read the Studio's discovery document and send their calls to the backend it names. The backend's own address keeps working.
