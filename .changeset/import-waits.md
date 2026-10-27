---
'@lupinum/ginko': minor
---

Change `import` to wait until the imported images are processed and to fail with the list of images that failed or timed out; `--no-wait` keeps the old behaviour and `--wait-timeout <seconds>` sets the limit.
