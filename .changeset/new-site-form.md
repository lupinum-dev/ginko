---
'@lupinum/ginko': minor
'@lupinum/ginko-preset-gastro': minor
---

Change how a site is written: `defineSite`, `single`, `collection` and `f` of `@lupinum/ginko` take a new form, and the form of 0.18 moves to `@lupinum/ginko/v1`.

Breaking. To update a site without rewriting it, change the import of `defineSite`, `single`, `collection` and `f` in `ginko.config.ts` and in your brick files from `'@lupinum/ginko'` to `'@lupinum/ginko/v1'`. Nothing else changes, and the stored model stays the same. A config of 0.18 that still imports from `'@lupinum/ginko'` stops with a message that names this line.

The new form writes the same stored model. Each fact of a site is said once, in one place:

- The site file says where a brick lives and where its pages are: `studio: { id, url, bricks }` replaces `site`, `platform` and `source: 'files'` on each brick; `entries: { blog: '/blog/[slug]' }` replaces `route` on a brick; paths in `pages` and `entries` are written without the language prefix. A collection with an address field (`f.slug`) needs its line in `entries`, or `null` for no page.
- Tasks have short names: `tasks: ['add', 'edit', 'remove']`. Their labels are made from `item`, the words for one entry as they stand in the sentence (`item: { de: 'Leistung', en: 'a service' }` gives "Leistung hinzufügen" and "Add a service"). An own task that makes an entry is `kind: 'add'`.
- `max` (500) and `order` (`'manual'`) of a collection, the limits of `f.number` and `f.file`, and `itemLabel` and `max` of `f.list` have defaults. `visible: { mode: 'until' }` is `showUntil`, and `status: { next: 'when' }` is `status: { show: 'next', field: 'when' }`.
- A label can be one text in the main language; the other editor languages come from `i18n/studio/<locale>.json`, passed as `texts`.
- `@lupinum/ginko/patterns` has the ready-made bricks as functions with options: `site()`, `legal()`, `notices()`, `people({ pages: true })`, `posts({ authors: 'people' })`, `jobs()`, `events()`, `sessions({ events: 'events', people: 'people' })`, `hours({ plans: 'hourPlans' })` and more. A brick that points to another brick takes that brick's key as an option. `extend` adds fields to one, replaces its tasks or changes its line on Today.

`@lupinum/ginko-preset-gastro`: `events()` no longer needs `route` (in the new form the address is a line in `entries`), and `lunch({ needsApproval: true })` makes the week a staff member enters wait for the owner's yes.
