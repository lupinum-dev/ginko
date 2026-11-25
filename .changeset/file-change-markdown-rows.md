---
'@lupinum/ginko-content': patch
---

Fix a list field with a Markdown text in a change of a content file: it is now refused like a Markdown field, since the text would not be built or exported with its images.
