---
"@lupinum/ginko": patch
---

Fix llms.txt, the Markdown twin of a page, its 404 suggestions and the site search naming an entry without a `title` field by its id (`people/lena-hofer`): they now use the field its slug is made from, such as a person's `name` with `people({ route })`.
