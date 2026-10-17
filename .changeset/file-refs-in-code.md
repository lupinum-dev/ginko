---
"@lupinum/ginko": patch
---

Fix `$file.<id>` references inside fenced or inline code counting as picture uses: they are text now, for the file checks and for the `local:files-export` rewrite. An escaped backtick (`` \` ``) opens no code.
