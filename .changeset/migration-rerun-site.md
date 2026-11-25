---
'@lupinum/ginko-server': patch
---

Add a rerun for a site the dated-changes migration skipped: `ops:status` lists its id and error kind, `npx convex run datedChanges:migrateOneSite '{"site":"<id>"}'` converts it after a fix, and a successful run takes it off the skipped list.
