---
'@lupinum/ginko': minor
---

Remove `planned` from `single()` and `collection()`, and `valueOn`: a value for a later day is a dated change now, so write `timeline: { public: ['price'] }` on the brick and `when: { from: 'ask' }` on the task that changes the field, drop the two plan fields, and read today's value from `data` and the coming ones from `upcoming`; `defineSite` and `ginko check` say so for a brick that still has `planned`, and a fact's `next` comes from the first waiting change; on the platform, planned values already stored become dated changes when the platform updates, and a site releases its config without `planned` after that update.
