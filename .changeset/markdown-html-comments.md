---
"@lupinum/ginko": patch
---

Fix HTML comments in Markdown (`<!-- TODO -->`) showing on the site as text: the parsed tree now leaves them out, also a comment around formatting or around whole paragraphs, and the stored text keeps them.
