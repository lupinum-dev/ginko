// YAML, JSON and CSV data files and drafts (CONTENT.md "Datendateien").
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { collection, defineSite, f } from '@lupinum/ginko'
import { serializeSchema } from '@lupinum/ginko/internal'
import { readContent } from '../src/read.ts'

const schema = serializeSchema(defineSite({
  site: 'preise', name: 'Preise', url: 'https://preise.example', timeZone: 'Europe/Vienna',
  locales: ['de', 'en'], currency: 'EUR', pages: { home: { de: '/', en: '/en' } },
  bricks: {
    angebote: collection({
      label: 'Angebote', source: 'files', max: 50, order: 'manual',
      route: { de: '/angebote/[slug]', en: '/en/offers/[slug]' },
      fields: {
        title: f.text('Titel'),
        slug: f.slug('Adresse', { from: 'title' }),
        price: f.money('Preis', { optional: true }),
        stock: f.number('Vorrat', { min: 0, max: 1000, step: 1, optional: true }),
        steps: f.list('Schritte', { itemLabel: 'Schritt', fields: { label: f.text('Name') }, max: 10, optional: true }),
      },
    }),
    docs: collection({
      label: 'Doku', source: 'files', max: 50, order: 'manual',
      route: { de: '/doku/[slug]', en: '/en/docs/[slug]' },
      fields: { title: f.text('Titel'), slug: f.slug('Adresse', { from: 'title' }), body: f.markdown('Text') },
    }),
    termine: collection({ label: 'Termine', source: 'files', max: 50, order: 'manual', fields: { angebot: f.ref('Angebot', { to: 'angebote' }), title: f.text('Titel') } }),
  },
}))

function read(files: Record<string, string>, options?: { drafts?: boolean }) {
  const root = mkdtempSync(join(tmpdir(), 'ginko-data-'))
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true })
    writeFileSync(join(root, path), text)
  }
  return readContent(join(root, 'content'), join(root, 'public'), schema, options)
}

describe('YAML and JSON entries', () => {
  it.each([
    ['YAML', 'yml', 'title: Kaffee\nprice: 3.5\nsteps: [mahlen, brühen]\n'],
    ['JSON', 'json', '{ "title": "Kaffee", "price": 3.5, "steps": ["mahlen", "brühen"] }'],
  ])('%s: the whole file is the entry, with name, order and translation', async (_, ext, text) => {
    const r = await read({ [`content/angebote/1.kaffee.${ext}`]: text, [`content/angebote/1.kaffee.en.${ext}`]: ext === 'json' ? '{ "title": "Coffee" }' : 'title: Coffee' })
    expect(r.errors).toEqual([])
    const [entry] = r.entries.angebote!
    expect([entry!.id, entry!.order, entry!.data.slug, entry!.data.price, entry!.data.title]).toEqual([
      'angebote/kaffee', 1, { de: 'kaffee', en: 'kaffee' }, { amount: 350 }, { de: 'Kaffee', en: 'Coffee' },
    ])
    expect((entry!.data.steps as { label: unknown }[]).map((s) => s.label)).toEqual([{ de: 'mahlen' }, { de: 'brühen' }])
  })

  it('a brick with a markdown field cannot use data files', async () => {
    const r = await read({ 'content/docs/a.yml': 'title: A' })
    expect(r.entries.docs).toEqual([])
    expect(r.errors).toEqual([{ file: 'docs/a.yml', path: 'body', message: expect.stringContaining('markdown field') }])
  })
})

describe('broken data files', () => {
  it.each([
    ['YAML', 'a.yml', 'title: Kaffee\nprice: [3\nstock: 2\n', 'Invalid YAML', 3],
    ['JSON', 'a.json', '{\n  "title": "Kaffee",\n  "price": }\n', 'Invalid JSON', 3],
  ])('%s: the error names the file and a line', async (_, file, text, message, line) => {
    const r = await read({ [`content/angebote/${file}`]: text })
    expect(r.entries.angebote).toEqual([])
    expect(r.errors).toHaveLength(1)
    expect(r.errors[0]).toMatchObject({ file: `angebote/${file}`, message: expect.stringContaining(message) })
    expect(r.errors[0]!.line).toBe(line)
  })
})

describe('CSV entries', () => {
  it('reads many entries: ; delimiter, quoted newline and quote, locale rows, empty cell = absent', async () => {
    const r = await read({
      'content/angebote/liste.csv': [
        'slug;locale;title;price;stock',
        'kaffee;;"Kaffee ""pur""\nmit Milch";3.5;10',
        'tee;;Tee;;',
        'kaffee;en;Coffee;;',
      ].join('\r\n'),
    })
    expect(r.errors).toEqual([])
    expect(r.entries.angebote!.map((e) => [e.id, e.order, e.data.title, e.data.price, e.data.stock])).toEqual([
      ['angebote/kaffee', 1, { de: 'Kaffee "pur"\nmit Milch', en: 'Coffee' }, { amount: 350 }, 10],
      ['angebote/tee', 2, { de: 'Tee' }, undefined, undefined],
    ])
  })

  it.each([
    ['comma decimal', 'slug,title,price\nkaffee,Kaffee,3.5\ntee,Tee,"3,5"', 3, 'price', 'not a number'],
    ['list column', 'slug,title,steps\nkaffee,Kaffee,mahlen', 2, 'steps', 'cannot be written in CSV'],
  ])('%s: the error names the column and the row line', async (_, text, line, path, message) => {
    const r = await read({ 'content/angebote/liste.csv': text })
    expect(r.errors).toEqual([{ file: 'angebote/liste.csv', path, line, message: expect.stringContaining(message) }])
    // The good row is still read.
    expect(r.entries.angebote!.map((e) => e.id)).toEqual(line === 3 ? ['angebote/kaffee'] : [])
  })

  it('needs a slug column', async () => {
    const r = await read({ 'content/angebote/liste.csv': 'title\nKaffee' })
    expect(r.errors).toEqual([{ file: 'angebote/liste.csv', line: 1, message: expect.stringContaining('“slug”') }])
  })
})

describe('drafts', () => {
  const files = {
    'content/angebote/1.fertig.yml': 'title: Fertig',
    'content/angebote/2.yaml-entwurf.yaml': 'title: Entwurf\ndraft: true',
    'content/angebote/3.json-entwurf.json': '{ "title": "Entwurf", "draft": true }',
    'content/angebote/liste.csv': 'slug,title,draft\ncsv-fertig,Csv,false\ncsv-entwurf,Csv Entwurf,true',
    'content/docs/a.md': '---\ntitle: A\ndraft: true\n---\n\nText.\n',
  }

  it.each([
    [{ drafts: false }, ['angebote/fertig', 'angebote/csv-fertig'], []],
    [undefined, ['angebote/fertig', 'angebote/yaml-entwurf', 'angebote/json-entwurf', 'angebote/csv-fertig', 'angebote/csv-entwurf'], ['docs/a']],
  ])('with %j', async (options, offers, docs) => {
    const r = await read(files, options)
    expect(r.errors).toEqual([])
    expect(r.entries.angebote!.map((e) => e.id)).toEqual(offers)
    expect(r.entries.docs!.map((e) => e.id)).toEqual(docs)
  })

  // Wrong behaviour caught: the sessions of a draft event on the site (and in its data), although the event is not.
  it.each([[{ drafts: false }, ['termine/fertig']], [undefined, ['termine/entwurf', 'termine/fertig']]])('an entry of a draft goes with it, with %j', async (options, dates) => {
    const r = await read({
      ...files,
      'content/termine/1.entwurf.md': '---\nangebot: angebote/yaml-entwurf\ntitle: Zum Entwurf\n---\n',
      'content/termine/2.fertig.md': '---\nangebot: angebote/fertig\ntitle: Zum fertigen Angebot\n---\n',
    }, options)
    expect(r.errors).toEqual([])
    expect(r.entries.termine!.map((e) => e.id)).toEqual(dates)
  })

  // Wrong behaviour caught: a shown draft loses its flag, so the site cannot mark it, or a finished entry gets one.
  it('keeps the flag on shown drafts only', async () => {
    const r = await read(files)
    expect(r.entries.angebote!.map((e) => e.data.draft ?? false)).toEqual([false, true, true, false, true])
  })
})

describe('scheduled entries', () => {
  const site = serializeSchema(defineSite({
    site: 'blog', name: 'Blog', url: 'https://blog.example', timeZone: 'Europe/Vienna', locales: ['en'], currency: 'EUR', pages: { home: { en: '/' } },
    bricks: {
      posts: collection({ label: 'Posts', source: 'files', max: 50, order: { field: 'date', dir: 'desc' }, fields: { title: f.text('Title'), date: f.date('Date') } }),
      events: collection({ label: 'Events', source: 'files', max: 50, order: { field: 'date', dir: 'asc' }, fields: { title: f.text('Title'), date: f.date('Date') } }),
    },
  }))
  const files = {
    'content/posts/past.yml': 'title: Past\ndate: 2026-10-15',
    'content/posts/today.yml': 'title: Today\ndate: 2026-10-16',
    'content/posts/tomorrow.yml': 'title: Tomorrow\ndate: 2026-10-17',
    'content/events/tomorrow.yml': 'title: Tomorrow\ndate: 2026-10-17',
  }

  // Wrong behaviour caught: a post dated in the future is online (pages, feed, sitemap) before its day, or a coming
  // event is hidden because its collection also has drafts.
  it.each([
    [{ drafts: false }, ['posts/today', 'posts/past']],
    [{ drafts: true }, ['posts/tomorrow', 'posts/today', 'posts/past']],
  ])('a post dated after the build day is left out with %j; a coming event stays', async (options, posts) => {
    const root = mkdtempSync(join(tmpdir(), 'ginko-scheduled-'))
    for (const [path, text] of Object.entries(files)) {
      mkdirSync(dirname(join(root, path)), { recursive: true })
      writeFileSync(join(root, path), text)
    }
    const r = await readContent(join(root, 'content'), join(root, 'public'), site, { ...options, today: '2026-10-16' })
    expect(r.errors).toEqual([])
    expect(r.entries.posts!.map((e) => e.id).sort()).toEqual([...posts].sort())
    expect(r.entries.events!.map((e) => e.id)).toEqual(['events/tomorrow'])
  })
})

describe('redirectFrom', () => {
  // Wrong behaviour caught: the reserved key is read as a field (error), lost on the way to the entry, or a bad value passes.
  it('is read from the main file (string or list) and kept on the entry', async () => {
    const r = await read({
      'content/docs/a.md': '---\ntitle: A\nredirectFrom: /alt-a\n---\n\nText.\n',
      'content/angebote/kaffee.yml': 'title: Kaffee\nredirectFrom: [/k1, /k2]',
    })
    expect(r.errors).toEqual([])
    expect(r.entries.docs![0]!.data.redirectFrom).toEqual(['/alt-a'])
    expect(r.entries.angebote![0]!.data.redirectFrom).toEqual(['/k1', '/k2'])
  })

  it.each([
    ['no slash', 'redirectFrom: alt', 'docs/a.md'],
    ['not text', 'redirectFrom: [1]', 'docs/a.md'],
    ['protocol-relative', 'redirectFrom: //evil.example', 'docs/a.md'],
  ])('reports a bad value (%s) with the file', async (_name, line, file) => {
    const r = await read({ 'content/docs/a.md': `---\ntitle: A\n${line}\n---\n\nText.\n` })
    expect(r.errors).toEqual([{ file, path: 'redirectFrom', message: expect.stringContaining('redirectFrom') }])
  })

  it('is rejected in a translation file', async () => {
    const r = await read({ 'content/docs/a.md': '---\ntitle: A\n---\n\nText.\n', 'content/docs/a.en.md': '---\ntitle: A\nredirectFrom: /x\n---\n\nText.\n' })
    expect(r.errors.map((e) => e.file)).toEqual(['docs/a.en.md'])
  })
})
