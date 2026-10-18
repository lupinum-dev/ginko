---
"@lupinum/ginko": minor
"@lupinum/ginko-docs": patch
---

Add `releaseAnchor(version)` to `@lupinum/ginko/basics`: the anchor of a release on a changelog page (`4.6.0` → `v4-6-0`). The changelog page of `@lupinum/ginko-docs` and the changelog feature of the templates (templates/_features/changelog/app/composables/useChangelog.ts, server/middleware/changelog-feed.ts) use it, so both keep the same public addresses.
