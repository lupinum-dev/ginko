---
"@lupinum/ginko": minor
"@lupinum/ginko-docs": minor
"@lupinum/ginko-content": minor
---

Change the Studio to one way of saving on every site: Speichern never puts anything online, and Veröffentlichen does.

For editors: a new entry starts as a draft, and Speichern on an entry or a single page that is online (Startseite, Preise, Öffnungszeiten) keeps the change as unpublished changes. "Veröffentlichen …" puts it online now or at a time, "Verwerfen" goes back to the version on the website, and an entry of a collection can still go back to a draft. Today lists what waits, with a Veröffentlichen button. A task on Today (for example "Heute geschlossen") has Veröffentlichen as its main button, so it still goes online with one press; its Speichern keeps the change unpublished. Moves in the navigation tree still go online at once. An AI assistant connected to the site also saves without publishing, unless you ask it to publish.

For site developers: remove `drafts` from `collection()` and `docsCollection()`; it is no longer an option. Schemas released with `drafts: true` or `drafts: false` still load and release. A file collection that lists its entries newest first by a date now always leaves out entries dated after the build day (before, only with `drafts: true`).
