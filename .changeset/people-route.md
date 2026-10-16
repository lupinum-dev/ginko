---
"@lupinum/ginko": patch
---

Add a `route` option to `people()` from `@lupinum/ginko/basics`: with it, each person gets a web address (a slug made from the name) and a page, for example speakers. Without it the stored fields stay as they are. Template files that read a person's `url` and need the route: `templates/_features/sessions/app/pages/speakers/[slug].vue`, `templates/_features/sessions/app/pages/speakers/index.vue`, `templates/_features/sessions/app/components/session/Speakers.vue` and `templates/_features/sessions/app/composables/useSessions.ts`.
