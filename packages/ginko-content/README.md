# @lupinum/ginko-content

Markdown files as a content source for [`@lupinum/ginko`](https://github.com/lupinum-dev/ginko/tree/main/packages/ginko).
At build time it reads `content/` and builds the same bundle the Ginko platform serves, so a site
reads files and platform content the same way, with `useGinko`. Use it for texts that developers
maintain: docs, a blog, legal pages.

## Use

```bash
npm install @lupinum/ginko @lupinum/ginko-content
```

Give a brick `source: 'files'` and one `f.markdown` field:

```ts
// ginko.config.ts
docs: collection({
  label: 'Docs',
  source: 'files',
  max: 500,
  order: 'manual',
  route: { en: '/docs/[slug]' },
  fields: { title: f.text('Title'), slug: f.slug('Address', { from: 'title' }), body: f.markdown('Text') },
}),
```

```text
content/docs/1.getting-started.md      one entry; the number is the order
content/docs/1.getting-started.de.md   its translation
```

The Ginko Nuxt module finds this package by itself. It serves the Markdown of a page with the page,
adds `<GinkoMarkdown>` and a search index. A file error fails the build and names the file.

Full guide: [Content from files](https://github.com/lupinum-dev/ginko/blob/main/sites/docs/content/docs/4.inhalte-aus-dateien.en.md).

## License

MIT © Lupinum OG
