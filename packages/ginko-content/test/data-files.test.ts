// YAML, JSON and CSV data files and drafts (CONTENT.md "Datendateien").
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { collection, defineSite, f } from '@lupinum/ginko/internal'
import { serializeSchema } from '@lupinum/ginko/internal'
import { readContent } from '../src/read.ts'

const schema = serializeSchema(defineSite({
  site: 'preise', name: 'Preise', url: 'https://preise.example', timeZone: 'Europe/Vienna',
  locales: ['de', 'en'], currency: 'EUR', week: { firstDay: 'mo', workdays: ['mo', 'tu', 'we', 'th', 'fr'] }, pages: { home: { de: '/', en: '/en' } },
  bricks: {
    angebote: collection({
      listing: { title: 'title' },
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
    docs: collection({ body: 'body',
      listing: { title: 'title' },
      label: 'Doku', source: 'files', max: 50, order: 'manual',
      route: { de: '/doku/[slug]', en: '/en/docs/[slug]' },
      fields: { title: f.text('Titel'), slug: f.slug('Adresse', { from: 'title' }), body: f.markdown('Text') },
    }),
    termine: collection({ listing: { title: 'title' }, label: 'Termine', source: 'files', max: 50, order: 'manual', fields: { angebot: f.ref('Angebot', { to: 'angebote' }), title: f.text('Titel') } }),
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
    'content/angebote/2.yaml-entwurf.yaml': 'title: Entwurf\n$draft: true',
    'content/angebote/3.json-entwurf.json': '{ "title": "Entwurf", "$draft": true }',
    'content/angebote/liste.csv': 'slug,title,$draft\ncsv-fertig,Csv,\ncsv-entwurf,Csv Entwurf,true',
    'content/docs/a.md': '---\ntitle: A\n$draft: true\n---\n\nText.\n',
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

  // Wrong behaviour caught: the old reserved name still hides an entry (or passes in silence), so a file written for
  // the old rule stays online or offline without a word.
  it.each([
    ['draft: true', 'draft', '`$draft: true`'],
    ['redirectFrom: /alt', 'redirectFrom', '`$redirectFrom: /old-path`'],
  ])('refuses %s on a brick without such a field, naming the $ key', async (line, path, key) => {
    const r = await read({ 'content/docs/a.md': `---\ntitle: A\n${line}\n---\n\nText.\n` }, { drafts: false })
    expect(r.errors).toEqual([{ file: 'docs/a.md', path, message: `“${path}” is no field of this brick. Write ${key}: keys that are no fields start with $.` }])
  })

  // Wrong behaviour caught: `draft` stays a reserved name, so a brick cannot have a field of that name.
  it('reads a field called draft as a field', async () => {
    const own = serializeSchema(defineSite({
      site: 'notes', name: 'Notes', url: 'https://notes.example', timeZone: 'Europe/Vienna', locales: ['en'], currency: 'EUR', week: { firstDay: 'mo', workdays: ['mo', 'tu', 'we', 'th', 'fr'] }, pages: { home: { en: '/' } },
      bricks: { notes: collection({ listing: { title: 'title' }, label: 'Notes', source: 'files', max: 50, order: 'manual', fields: { title: f.text('Title'), draft: f.boolean('Draft') } }) },
    }))
    const root = mkdtempSync(join(tmpdir(), 'ginko-draft-field-'))
    mkdirSync(join(root, 'content/notes'), { recursive: true })
    writeFileSync(join(root, 'content/notes/a.yml'), 'title: A\ndraft: true')
    const r = await readContent(join(root, 'content'), join(root, 'public'), own, { drafts: false })
    expect(r.errors).toEqual([])
    expect(r.entries.notes!.map((e) => [e.id, e.data.draft])).toEqual([['notes/a', true]])
  })

  // Wrong behaviour caught: a misspelt or future `$` key ($changes) is dropped in silence, or read as a field.
  it('refuses a $ key Ginko does not know', async () => {
    const r = await read({ 'content/angebote/a.yml': 'title: A\n$changes: ja' })
    expect(r.errors).toEqual([{ file: 'angebote/a.yml', path: '$changes', message: '“$changes” is not a key Ginko knows. Keys that start with $ are $draft, $redirectFrom; every other key is a field of the brick.' }])
  })

  // Wrong behaviour caught: `$draft: false` or `$draft: yes` is taken as a second written form, or a translation
  // marks one language a draft although the entry has one state.
  it.each([
    [{ 'content/angebote/a.yml': 'title: A\n$draft: false' }, 'angebote/a.yml', '“$draft” takes only true. Leave it out for an entry that is online.'],
    [{ 'content/angebote/a.yml': 'title: A', 'content/angebote/a.en.yml': 'title: A\n$draft: true' }, 'angebote/a.en.yml', '“$draft” belongs in the main-language file.'],
  ])('refuses a $draft that is not true in the main file (%#)', async (files, file, message) => {
    const r = await read(files)
    expect(r.errors).toEqual([{ file, path: '$draft', message }])
  })
})

describe('scheduled entries', () => {
  const site = serializeSchema(defineSite({
    site: 'blog', name: 'Blog', url: 'https://blog.example', timeZone: 'Europe/Vienna', locales: ['en'], currency: 'EUR', week: { firstDay: 'mo', workdays: ['mo', 'tu', 'we', 'th', 'fr'] }, pages: { home: { en: '/' } },
    bricks: {
      posts: collection({ listing: { title: 'title' }, label: 'Posts', source: 'files', max: 50, order: { field: 'date', dir: 'desc' }, fields: { title: f.text('Title'), date: f.date('Date') } }),
      events: collection({ listing: { title: 'title' }, label: 'Events', source: 'files', max: 50, order: { field: 'date', dir: 'asc' }, fields: { title: f.text('Title'), date: f.date('Date') } }),
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

describe('$redirectFrom', () => {
  // Wrong behaviour caught: the old paths are lost on the way to the entry, or land in `data` as if they were a field.
  it('is read from the main file (string or list) and kept beside the fields', async () => {
    const r = await read({
      'content/docs/a.md': '---\ntitle: A\n$redirectFrom: /alt-a\n---\n\nText.\n',
      'content/angebote/kaffee.yml': 'title: Kaffee\n$redirectFrom: [/k1, /k2]',
    })
    expect(r.errors).toEqual([])
    expect(r.entries.docs![0]!.redirectFrom).toEqual(['/alt-a'])
    expect(r.entries.angebote![0]!.redirectFrom).toEqual(['/k1', '/k2'])
  })

  it.each([
    ['no slash', '$redirectFrom: alt', 'docs/a.md'],
    ['not text', '$redirectFrom: [1]', 'docs/a.md'],
    ['protocol-relative', '$redirectFrom: //evil.example', 'docs/a.md'],
  ])('reports a bad value (%s) with the file', async (_name, line, file) => {
    const r = await read({ 'content/docs/a.md': `---\ntitle: A\n${line}\n---\n\nText.\n` })
    expect(r.errors).toEqual([{ file, path: '$redirectFrom', message: '“$redirectFrom” must be a path or a list of paths, each starting with “/”.' }])
  })

  it('is rejected in a translation file', async () => {
    const r = await read({ 'content/docs/a.md': '---\ntitle: A\n---\n\nText.\n', 'content/docs/a.en.md': '---\ntitle: A\n$redirectFrom: /x\n---\n\nText.\n' })
    expect(r.errors.map((e) => e.file)).toEqual(['docs/a.en.md'])
  })
})

// Wrong behaviour caught: `data` carries `draft` or `redirectFrom` again (guess 16), so site code reads a key that is
// no field and a brick's own field of that name is shadowed.
it('data holds the fields only', async () => {
  const r = await read({
    'content/angebote/a.yml': 'title: A\n$draft: true\n$redirectFrom: /alt',
    'content/docs/a.md': '---\ntitle: A\n$redirectFrom: /alt-doc\n---\n\nText.\n',
  })
  expect(r.errors).toEqual([])
  expect([...r.entries.angebote!, ...r.entries.docs!].map((e) => Object.keys(e.data).filter((k) => !['title', 'slug', 'steps', 'body'].includes(k)))).toEqual([[], []])
})
