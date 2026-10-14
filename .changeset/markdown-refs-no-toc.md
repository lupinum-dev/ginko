---
"@lupinum/ginko": minor
"@lupinum/ginko-docs": patch
---

Change Markdown refs in page state to carry no table of contents: read `toc` from the loaded text, `(await useGinkoMarkdown(() => entry.value.data.body)).value?.toc`.
