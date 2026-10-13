// The search index: sections of file items with a URL, found with German stemming and umlaut folding.
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { collection, defineSite, f, single, type MarkdownTree } from '@lupinum/ginko'
import { serializeSchema } from '@lupinum/ginko/internal'
import { buildIndex, searchSections, type SearchRecord } from '@lupinum/ginko/internal/search'
import { loadIndex, search } from '@lupinum/ginko/search'
import { buildFileBundles, searchIndex, withMarkdownRefs } from '../src/index.ts'

const schema = serializeSchema(defineSite({
  site: 'doku', name: 'Doku', url: 'https://doku.example', timezone: 'Europe/Vienna',
  locales: ['de', 'en'], currency: 'EUR', pages: { home: { de: '/', en: '/en' } },
  bricks: {
    docs: collection({
      label: 'Doku', source: 'files', max: 50, order: 'manual',
      route: { de: '/doku/[slug]', en: '/en/docs/[slug]' },
      fields: { title: f.text('Titel'), slug: f.slug('Adresse', { from: 'title' }), description: f.longtext('Beschreibung', { optional: true }), badge: f.text('Badge', { optional: true }), body: f.markdown('Text') },
    }),
    drafts: collection({ label: 'Entwürfe', source: 'files', max: 50, order: 'manual', fields: { title: f.text('Titel'), body: f.markdown('Text') } }),
    legal: single({ label: 'Rechtliches', source: 'files', fields: { title: f.text('Titel'), body: f.markdown('Text') } }),
  },
}))

/** A site folder with `content/` and `public/` from a map of relative paths to file contents. */
function site(files: Record<string, string>) {
  const root = mkdtempSync(join(tmpdir(), 'ginko-search-'))
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true })
    writeFileSync(join(root, path), text)
  }
  return { content: join(root, 'content'), public: join(root, 'public') }
}
const md = (front: string, body: string) => `---\n${front}\n---\n\n${body}\n`

/** The records and the searcher the module builds: bundles with markdown refs, the trees behind them, per locale. */
async function build(files: Record<string, string>, locale: 'de' | 'en' = 'de') {
  const s = site(files)
  const { bundles } = await buildFileBundles(s.content, s.public, schema)
  const trees = new Map<string, MarkdownTree>()
  const bundle = withMarkdownRefs(bundles[locale]!, schema, trees)
  const records = searchSections(bundle, { schema, trees })
  const index = loadIndex(searchIndex(bundle, trees, schema))
  return { records, find: (query: string) => search(index, query).map((hit) => hit.id) }
}

describe('search sections', () => {
  it('makes one record for the text before the first h2 and one per h2/h3, with anchors', async () => {
    const { records } = await build({
      'content/docs/1.einstieg.md': md('title: Einstieg', 'Vorspann.\n\n## Erste Schritte\n\nHallo **Welt**.\n\n### Details\n\n- Punkt eins\n- Punkt zwei'),
    })
    expect(records).toEqual([
      { id: 'docs/einstieg', url: '/doku/einstieg', title: 'Einstieg', text: 'Vorspann.', excerpt: 'Vorspann.', brick: 'docs', locale: 'de' },
      { id: 'docs/einstieg#erste-schritte', url: '/doku/einstieg#erste-schritte', title: 'Einstieg', heading: 'Erste Schritte', text: 'Hallo Welt.', excerpt: 'Hallo Welt.', brick: 'docs', locale: 'de' },
      { id: 'docs/einstieg#erste-schritte-details', url: '/doku/einstieg#erste-schritte-details', title: 'Einstieg', heading: 'Details', text: 'Punkt eins\nPunkt zwei', excerpt: 'Punkt eins Punkt zwei', brick: 'docs', locale: 'de' },
    ])
  })

  it('indexes longtext fields such as the description but not short text fields such as a badge or an icon name', async () => {
    // Wrong behaviour caught: "Neu lucide:languages" (badge, icon) ends up in the indexed text and is found by search.
    const { records, find } = await build({
      'content/docs/1.sprachen.md': md('title: Sprachen\ndescription: Mehrsprachige Seiten\nbadge: Neu', 'Der Inhalt.'),
    })
    expect(records.map((r) => r.text)).toEqual(['Mehrsprachige Seiten\nDer Inhalt.'])
    expect(find('Neu')).toEqual([])
    expect(find('Mehrsprachige')).toEqual(['docs/sprachen'])
  })

  it('leaves out code blocks', async () => {
    const { records } = await build({
      'content/docs/1.code.md': md('title: Code', 'Vor dem Beispiel.\n\n```ts\nconst GEHEIM = 1\n```\n\nNach dem Beispiel.'),
    })
    expect(records.map((r) => r.text)).toEqual(['Vor dem Beispiel.\nNach dem Beispiel.'])
  })

  it('skips singles and items without a URL', async () => {
    const { records } = await build({
      'content/docs/1.a.md': md('title: Mit Adresse', 'Text.'),
      'content/drafts/1.b.md': md('title: Ohne Adresse', 'Text.'),
      'content/legal.md': md('title: Impressum', 'Text.'),
    })
    expect(records.map((r) => r.id)).toEqual(['docs/a'])
  })
})

describe('search', () => {
  const files = {
    'content/docs/1.restaurant.md': md('title: Restaurant', 'Willkommen.\n\n## Öffnungszeiten\n\nTäglich ab 11 Uhr.\n\n## Speisekarte\n\nWir kochen jeden Tag ein Gericht aus der Region.'),
  }

  it.each([
    ['Oeffnungszeiten', 'docs/restaurant#oeffnungszeiten'],
    ['Gerichte', 'docs/restaurant#speisekarte'],
    ['Speisekate', 'docs/restaurant#speisekarte'],
  ])('"%s" finds %s', async (query, id) => {
    const { find } = await build(files)
    expect(find(query)[0]).toBe(id)
  })
})

describe('search in the language of the index', () => {
  it('an English index stems English words: "connecting" finds "connected"', () => {
    const record = (id: string, text: string): SearchRecord => ({ id, url: `/${id}`, title: id, text, excerpt: '', brick: 'docs', locale: 'en' })
    const index = loadIndex(buildIndex([record('setup', 'How the site connected to the platform.'), record('other', 'Nothing here.')], 'en'))
    expect(search(index, 'connecting')[0]?.id).toBe('setup')
  })
})
