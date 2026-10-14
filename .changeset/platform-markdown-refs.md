---
"@lupinum/ginko": minor
"@lupinum/ginko-content": patch
---

Change platform Markdown fields to `{ ref }` in page state, as file bricks already are, so a page's payload carries only the texts it shows.

Site code that reads a text's tree from an entry (`entry.data.body.nodes`) gets nothing now: load it with `useGinkoMarkdown(() => entry.value.data.body)` or, for several texts in one `useAsyncData`, `fetchGinkoMarkdown(value)`. `<GinkoMarkdown>` needs no change. A client navigation loads a text it has not shown yet from `/__ginko/platform/<locale>/<rev>/md/…`.
