---
"@lupinum/ginko-content": minor
---

Add scheduled entries for file content: in a collection with drafts that lists its entries newest first by a date (such as `posts()` with `drafts: true`), an entry dated after the build day is left out of the build like a draft, and the first build on or after its date publishes it. The `blog` template feature relies on it (`templates/_features/blog`).
