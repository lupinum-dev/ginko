---
"@lupinum/ginko-i18n": patch
---

Fix cached pages changing with every visitor: outside user-locale zones the server no longer puts the visitor's browser language into the page state, so an ISR page renders the same for everyone and an unchanged revalidation is not stored as a new page.
