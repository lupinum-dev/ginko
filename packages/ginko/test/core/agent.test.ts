import { describe, expect, test } from 'vitest'
import { entryMarkdown, llmsFullTxt, llmsTxt, parseMarkdown, type AgentOptions, type Bundle, type BundleItem, type Schema } from '../../src/core/index.ts'
import { markdownNotFound } from '../../src/core/agent.ts'

const schema = {
  bricks: {
    blog: {
      kind: 'collection',
      label: 'Blog',
      fields: {
        title: { type: 'text', label: 'Titel' },
        intro: { type: 'longtext', label: 'Einleitung' },
        body: { type: 'markdown', label: 'Text' },
      },
    },
    pages: { kind: 'collection', label: 'Seiten', fields: { title: { type: 'text', label: 'Titel' } } },
    settings: { kind: 'single', label: 'Einstellungen', fields: { title: { type: 'text', label: 'Titel' } } },
    people: { kind: 'collection', label: 'Vortragende', fields: { name: { type: 'text', label: 'Name' }, slug: { type: 'slug', label: 'Adresse', from: 'name' } } },
  },
} as unknown as Pick<Schema, 'bricks'>

const options: AgentOptions = { schema }

const item = (id: string, data: Record<string, unknown>, urls?: BundleItem['urls']): BundleItem => ({ id, data, fallback: [], ...(urls ? { urls } : {}) })

describe('entryMarkdown', () => {
  test('title, text and longtext fields, then a markdown tree', async () => {
    const body = await parseMarkdown('## Schritte\n\n- eins\n- zwei\n\nSiehe [Doku](https://example.com/doku).')
    const markdown = await entryMarkdown(item('a', { title: 'Erster Beitrag', intro: 'Kurz vorweg.', body: body.value }), 'blog', options)
    expect(markdown).toBe('# Erster Beitrag\n\nKurz vorweg.\n\n## Schritte\n\n- eins\n- zwei\n\nSiehe [Doku](https://example.com/doku).\n')
  })

  test('text fields stay text: HTML and Markdown syntax in a title or intro is escaped', async () => {
    const markdown = await entryMarkdown(item('a', { title: 'Hi <img src=x onerror=alert(1)>\n# not a heading', intro: 'See [x](javascript:alert(2)) *now*' }), 'blog', options)
    expect(markdown).toBe('# Hi \\<img src=x onerror=alert(1)\\> \\# not a heading\n\nSee \\[x\\](javascript:alert(2)) \\*now\\*\n')
  })

  test('a title with a long run of spaces is turned into its heading at once', async () => {
    const start = performance.now()
    const markdown = await entryMarkdown(item('a', { title: `a${' '.repeat(100_000)}b \t\n\n  c` }), 'blog', options)
    expect(performance.now() - start).toBeLessThan(1000)
    expect(markdown).toBe(`# a${' '.repeat(100_000)}b c\n`)
  })

  test('a { ref } markdown value is read from the trees map', async () => {
    const body = await parseMarkdown('Nur **fett**.')
    const trees = new Map([['blog/a/body', body.value]])
    const markdown = await entryMarkdown(item('a', { title: 'Ref', body: { ref: 'blog/a/body' } }), 'blog', { schema, trees })
    expect(markdown).toBe('# Ref\n\nNur **fett**.\n')
  })
})

describe('llmsTxt', () => {
  test('lists the collection entries that have a URL, linked to their Markdown', () => {
    const bundle = {
      format: 3,
      site: 'lupi',
      locale: 'de',
      locales: ['de'],
      mainLocale: 'de',
      currency: 'EUR',
      schemaRev: 1,
      contentRev: 1,
      generatedAt: '2026-10-11T00:00:00.000Z',
      bricks: {
        blog: { kind: 'collection', items: [item('a', { title: 'Erster Beitrag' }, { de: '/blog/erster' }), item('b', { title: 'Entwurf' })] },
        pages: { kind: 'collection', items: [item('home', { title: 'Start' }, { de: '/' })] },
        settings: { kind: 'single', data: { title: 'Ignoriert' }, fallback: [] },
      },
    } as unknown as Bundle
    expect(llmsTxt(bundle, { schema, siteName: 'Lupinum', description: 'Agentur für Webprojekte.', origin: 'https://lupinum.com/' })).toBe(
      '# Lupinum\n\n> Agentur für Webprojekte.\n\n## Blog\n\n- [Erster Beitrag](https://lupinum.com/blog/erster.md)\n\n## Seiten\n\n- [Start](https://lupinum.com/index.md)\n',
    )
    // An origin with a long run of slashes is read at once.
    const start = performance.now()
    const slashes = llmsTxt(bundle, { schema, siteName: 'Lupinum', origin: `https://lupinum.com${'/'.repeat(100_000)}x//` })
    expect(performance.now() - start).toBeLessThan(1000)
    expect(slashes).toContain(`(https://lupinum.com${'/'.repeat(100_000)}x/blog/erster.md)`)
  })
})

describe('entries without a title', () => {
  // Wrong behaviour caught: people with pages (speakers) have a name but no title, so llms.txt and the Markdown twin
  // named each one by its entry id ("people/lena-hofer").
  test('are named by the field their slug is made from', async () => {
    const lena = item('people/lena-hofer', { name: 'Lena Hofer', slug: 'lena-hofer' }, { de: '/vortragende/lena-hofer' })
    const bundle = {
      format: 3, site: 'lupi', locale: 'de', locales: ['de'], mainLocale: 'de', currency: 'EUR', schemaRev: 1, contentRev: 1,
      generatedAt: '2026-10-11T00:00:00.000Z', bricks: { people: { kind: 'collection', items: [lena] } },
    } as unknown as Bundle
    expect(llmsTxt(bundle, { schema, siteName: 'Lupinum', origin: 'https://lupinum.com' })).toContain('- [Lena Hofer](https://lupinum.com/vortragende/lena-hofer.md)')
    expect(await entryMarkdown(lena, 'people', options)).toBe('# Lena Hofer\n')
  })
})

describe('llmsFullTxt', () => {
  test('two pages in llmsTxt order, each with its Source line and Markdown', async () => {
    const bundle = {
      format: 3,
      site: 'lupi',
      locale: 'de',
      locales: ['de'],
      mainLocale: 'de',
      currency: 'EUR',
      schemaRev: 1,
      contentRev: 1,
      generatedAt: '2026-10-11T00:00:00.000Z',
      bricks: {
        blog: { kind: 'collection', items: [item('a', { title: 'Erster Beitrag', intro: 'Kurz vorweg.' }, { de: '/blog/erster' }), item('b', { title: 'Entwurf' })] },
        pages: { kind: 'collection', items: [item('home', { title: 'Start' }, { de: '/' })] },
      },
    } as unknown as Bundle
    expect(await llmsFullTxt(bundle, { schema, siteName: 'Lupinum', description: 'Agentur für Webprojekte.', origin: 'https://lupinum.com/' })).toBe(
      '# Lupinum\n\n> Agentur für Webprojekte.\n\n---\n\nSource: https://lupinum.com/blog/erster\n\n# Erster Beitrag\n\nKurz vorweg.\n\n---\n\nSource: https://lupinum.com/\n\n# Start\n',
    )
  })
})

describe('markdownNotFound', () => {
  const bundle = {
    format: 3,
    site: 'lupi',
    locale: 'de',
    locales: ['de'],
    mainLocale: 'de',
    currency: 'EUR',
    schemaRev: 1,
    contentRev: 1,
    generatedAt: '2026-10-11T00:00:00.000Z',
    bricks: {
      blog: {
        kind: 'collection',
        items: [
          item('gulasch', { title: 'Gulasch' }, { de: '/blog/rezept-gulasch' }),
          item('wiener', { title: 'Wiener Schnitzel mit Rezept' }, { de: '/blog/wiener-schnitzel-rezept' }),
          item('ohne-url', { title: 'Wiener Entwurf' }),
        ],
      },
    },
  } as unknown as Bundle

  test.each([
    {
      name: 'suggests the entries with the most matching words first, in bundle order on ties',
      path: '/rezept-wiener.md',
      expected:
        '# Not found\n\nThere is no page at `/rezept-wiener.md`.\n\n## Maybe you meant\n\n' +
        '- [Wiener Schnitzel mit Rezept](https://lupinum.com/blog/wiener-schnitzel-rezept.md)\n' +
        '- [Gulasch](https://lupinum.com/blog/rezept-gulasch.md)\n\n' +
        'All pages: https://lupinum.com/llms.txt\n',
    },
    {
      name: 'no matching word: no suggestion list',
      path: '/kontakt.md',
      expected: '# Not found\n\nThere is no page at `/kontakt.md`.\n\nAll pages: https://lupinum.com/llms.txt\n',
    },
  ])('$name', ({ path, expected }) => {
    expect(markdownNotFound(bundle, path, { origin: 'https://lupinum.com/' })).toBe(expected)
  })
})
