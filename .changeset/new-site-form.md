---
'@lupinum/ginko': minor
'@lupinum/ginko-preset-gastro': minor
---

Change how a site is written: `defineSite`, `single`, `collection` and `f` of `@lupinum/ginko` take a new, shorter form, and the form of 0.18 moves to `@lupinum/ginko/v1`.

Breaking. To update a site without rewriting it, change the import of `defineSite`, `single`, `collection` and `f` in `ginko.config.ts` and in your brick files from `'@lupinum/ginko'` to `'@lupinum/ginko/v1'`. Nothing else changes, and the stored model stays the same. A config of 0.18 that still imports from `'@lupinum/ginko'` stops with a message that names this line.

The new form writes the same stored model with less code:

- The site file says where a brick lives and where its pages are: `studio: { id, url, bricks }` replaces `site`, `platform` and `source: 'files'` on each brick; `entries: { blog: '/blog/[slug]' }` replaces `route` on a brick; paths in `pages` and `entries` are written without the language prefix.
- Tasks have short names: `tasks: ['add', 'edit', 'remove']`. Their labels are made from `item`, the word for one entry.
- `max` (500) and `order` (`'manual'`) of a collection, the limits of `f.number` and `f.file`, and `max` of `f.list` have defaults. `visible: { mode: 'until' }` is `showUntil`, `status: { next: 'when' }` is `status: { show: 'next', field: 'when' }`, and a list writes `item` for `itemLabel`.
- A label can be one text in the main language; the other editor languages come from `i18n/studio/<locale>.json`, passed as `texts`.
- `@lupinum/ginko/patterns` has the ready-made bricks (`site`, `legal`, `notices`, `people`, `posts`, `jobs`, `events`, …) as finished bricks, and `extend` changes one.

`events()` of `@lupinum/ginko-preset-gastro` no longer needs `route`: in the new form the address is a line in `entries`.
