---
'@lupinum/ginko-docs': minor
---

Change the docs bricks to patterns: `extend(changelogCollection(), { preview: 'changelog' })` changes one, the address of the docs and of a post is a line in `entries` (`docs: '/docs/[slug]'`, `posts: '/blog/[slug]'`), and the options `locales`, `base` and `source` are gone (`studio.bricks` says where a brick lives); the stored model of each brick stays the same. Remove `homePages`, `blogPages` and `changelogPages`, which gave paths with the language prefix that `defineSite` refuses: write `home: '/'`, `blog: '/blog'` and `changelog: '/changelog'` in `pages`. The type `DocsSource` is gone.
