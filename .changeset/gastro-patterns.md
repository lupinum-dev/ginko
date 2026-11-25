---
'@lupinum/ginko-preset-gastro': minor
---

Change the gastro bricks to patterns: `extend(menu(), { preview: 'menu' })` changes one, and the `source` option of every brick and the `route` option of `events()` are gone (`studio.bricks` and `entries` in the site file say where a brick lives and where an event's page is); the stored model of each brick stays the same.
