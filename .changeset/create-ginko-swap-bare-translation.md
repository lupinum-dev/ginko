---
"create-ginko": patch
---

Fix `--locales` with a new main language for content whose translation has no frontmatter (only text): the main file's fields, such as a changelog's version and date, now move to the new main file instead of failing the build.
