---
'@lupinum/ginko': minor
---

Add a release check for facts: a release that removes a fact that texts still quote is refused and names those texts (`pnpm local:dev` shows a warning instead), and the pushed schema now includes `languages`, so the platform formats fact values the same way the site does.
