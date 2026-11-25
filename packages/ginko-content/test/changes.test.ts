// `$changes` in a file (D117–D122): written like the fields, checked with the entry, applied with the build's day; only
// the fields of `timeline.public` of a change still ahead reach a page, never in the Markdown twin or the search.
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import { collection, defineSite, entryMarkdown, f, serializeSchema, single } from '@lupinum/ginko/internal'
import * as bothHomes from '../../ginko/test/fixtures/both-homes.ts'
import { buildFileBundles, publicBundle, searchIndex } from '../src/index.ts'
import { readContent } from '../src/read.ts'

const schema = serializeSchema(defineSite({
  site: 'karte', name: 'Karte', url: 'https://karte.example', timeZone: 'Europe/Vienna',
  locales: ['de'], currency: 'EUR', week: { firstDay: 'mo', workdays: ['mo', 'tu', 'we', 'th', 'fr'] }, pages: { home: '/' },
  bricks: {
    menu: collection({
      listing: { title: 'name' }, label: 'Karte', source: 'files', max: 20, order: 'manual', route: { de: '/karte/[slug]' },
      fields: {
        name: f.text('Name', { max: 40 }),
        slug: f.slug('Adresse', { from: 'name' }),
        price: f.money('Preis'),
        note: f.text('Hinweis', { max: 40, optional: true }),
        photo: f.image('Foto', { optional: true }),
        story: f.markdown('Geschichte', { profile: 'inline', optional: true }),
      },
      timeline: { public: ['price', 'photo'] },
    }),
    practice: single({ label: 'Praxis', source: 'files', fields: { price: f.money('Preis'), room: f.text('Raum', { max: 20 }) }, timeline: { public: ['price'] } }),
    guide: single({ label: 'Anleitung', source: 'files', fields: { steps: f.list('Schritte', { itemLabel: 'Schritt', fields: { text: f.markdown('Text', { profile: 'inline' }) }, max: 5, optional: true }) } }),
  },
}))

// The build runs on 8 October 2026 in Vienna.
const NOW = new Date('2026-10-08T10:00:00Z')

function site(files: Record<string, string | Buffer>) {
  const root = mkdtempSync(join(tmpdir(), 'ginko-changes-'))
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true })
    writeFileSync(join(root, path), text)
  }
  return { content: join(root, 'content'), public: join(root, 'public') }
}
const read = (files: Record<string, string | Buffer>, now = NOW) => { const s = site(files); return readContent(s.content, s.public, schema, { drafts: false, now }) }

const soup = `name: Suppe
price: 9
note: heiß
$changes:
  - from: 2026-10-01
    set: { price: 9.5 }
  - from: 2026-11-01
    set: { price: 10.5, note: null }
  - from: 2026-12-01
    set: { note: Trüffelgeheimnis }
`

describe('$changes in a file', () => {
  it('writes the changes whose day has come into the values and keeps the others in the stored form', async () => {
    const r = await read({ 'content/menu/suppe.yml': soup })
    expect(r.errors).toEqual([])
    expect(r.entries.menu).toMatchObject([{
      id: 'menu/suppe',
      data: { name: { de: 'Suppe' }, price: { amount: 950 }, note: { de: 'heiß' } },
      changes: [{ from: '2026-11-01', set: { price: { amount: 1050 }, note: null } }, { from: '2026-12-01', set: { note: { de: 'Trüffelgeheimnis' } } }],
    }])
  })

  it('a change starts with the first build on or after its day', async () => {
    const r = await read({ 'content/menu/suppe.yml': soup }, new Date('2026-11-01T10:00:00Z'))
    expect(r.entries.menu?.[0]?.data).toEqual({ name: { de: 'Suppe' }, slug: { de: 'suppe' }, price: { amount: 1050 } })
    expect(r.entries.menu?.[0]?.changes).toEqual([{ from: '2026-12-01', set: { note: { de: 'Trüffelgeheimnis' } } }])
  })

  it('warns for each field of a change whose day has come and notes once that a change waits for a build', async () => {
    const r = await read({ 'content/menu/suppe.yml': soup, 'content/practice.yml': 'price: 90\nroom: A\n$changes:\n  - from: 2027-01-01\n    set: { price: 95 }\n' })
    expect(r.warnings).toEqual([{ file: 'menu/suppe.yml', path: '$changes.0.set.price', message: 'The day of this change (2026-10-01) has come: write 9.5 into “price” and remove the change. While it stays, it wins over the field.' }])
    expect(r.notes).toEqual([{ file: 'menu/suppe.yml', path: '$changes.1', message: 'A change from 2026-11-01 is still to come: a dated change in a file starts with the first build on or after its day. Build the site on that day, for example with a daily build.' }])
  })

  // Wrong behaviour caught: an entry held back by its $publishAt still tells the owner to write a change's value into
  // it; a change that clears a field asks to write null into it.
  it.each([
    ['a planned entry', { 'content/menu/suppe.yml': `$publishAt: 2026-12-01T10:00\n${soup}` }, []],
    ['a cleared field', { 'content/menu/suppe.yml': 'name: Suppe\nprice: 9\nnote: heiß\n$changes:\n  - from: 2026-10-01\n    set: { note: null }\n' },
      [{ file: 'menu/suppe.yml', path: '$changes.0.set.note', message: 'The day of this change (2026-10-01) has come: remove “note” from the entry and remove the change. While it stays, it wins over the field.' }]],
  ])('the warning for a change whose day has come: %s', async (_, files, expected) => {
    expect((await read(files)).warnings).toEqual(expected)
  })

  it('reads an image in a change as the field reads it', async () => {
    const png = await sharp({ create: { width: 4, height: 3, channels: 3, background: '#fff' } }).png().toBuffer()
    const r = await read({ 'public/neu.png': png, 'content/menu/suppe.yml': 'name: Suppe\nprice: 9\n$changes:\n  - from: 2026-11-01\n    set: { photo: { src: /neu.png, alt: Teller } }\n' })
    expect(r.errors).toEqual([])
    expect(r.entries.menu?.[0]?.changes).toEqual([{ from: '2026-11-01', set: { photo: { file: '/neu.png', alt: { de: 'Teller' } } } }])
    expect(r.files['/neu.png']).toMatchObject({ url: '/neu.png', width: 4, height: 3 })
  })

  it.each([
    ['a field a change may not set', 'set: { slug: neu }', '$changes.0.set.slug', '“Adresse” cannot start on a day: it decides when or where the entry shows.'],
    ['a value the field refuses', 'set: { note: dieser Hinweis ist viel zu lang für das Feld Hinweis }', '$changes.0.set.note.de', 'Change from 2026-11-01: “Hinweis” is too long (at most 40 characters).'],
    ['an end before its start', 'until: 2026-10-31\n    set: { price: 10 }', '$changes.0.until', 'The end of a change (2026-10-31) is before its start (2026-11-01).'],
    // Wrong behaviour caught: a Markdown text in a change of a file is stored as text beside the entry's trees.
    ['a Markdown text', 'set: { story: Neu mit **Kräutern** }', '$changes.0.set.story', '“story” is a Markdown text, and a Markdown text cannot be in a change in a file. Change the text in the file on its day.'],
  ])('refuses the entry for %s and names the change', async (_, change, path, message) => {
    const r = await read({ 'content/menu/suppe.yml': `name: Suppe\nprice: 9\n$changes:\n  - from: 2026-11-01\n    ${change}\n` })
    expect(r.errors).toEqual([{ file: 'menu/suppe.yml', path, message }])
    expect(r.entries.menu).toEqual([])
  })

  // Wrong behaviour caught: a Markdown text in the rows of a list slips through, so it is stored beside the entry's trees
  // and no export rewrites the images it shows.
  it('refuses a list that holds a Markdown text in a change', async () => {
    const r = await read({ 'content/guide.yml': '$changes:\n  - from: 2026-11-01\n    set: { steps: [{ text: Neu mit **Kräutern** }] }\n' })
    expect(r.errors).toEqual([{ file: 'guide.yml', path: '$changes.0.set.steps', message: '“steps” holds a Markdown text, and a Markdown text cannot be in a change in a file. Change the text in the file on its day.' }])
  })

  it('refuses $changes in a CSV row', async () => {
    const r = await read({ 'content/menu/karte.csv': 'slug,name,price,$changes\nsuppe,Suppe,9,x\n' })
    expect(r.errors).toEqual([{ file: 'menu/karte.csv', path: '$changes', line: 2, message: '“$changes” is a list of changes, which a CSV cell cannot hold. Write the entry as a YAML, JSON or Markdown file.' }])
  })
})

// Slice 3: a change with an end in a file. It stays written as it is; the bundle of the build's day lays it over the
// normal value while it holds.
describe('a change with an end in a file', () => {
  const offer = `name: Suppe
price: 9
$changes:
  - from: 2026-10-01
    until: 2026-10-31
    set: { price: 7 }
  - from: 2026-11-15
    until: 2026-11-30
    set: { price: 8 }
`
  // Wrong behaviour caught: the end is dropped on the way in, an exception is written into the stored values (so it
  // would stay after its end), or an ended one is still kept.
  it('keeps the normal value in the entry and the exceptions that have not ended, with their end', async () => {
    const r = await read({ 'content/menu/suppe.yml': offer })
    expect(r.errors).toEqual([])
    expect(r.entries.menu?.[0]).toMatchObject({
      data: { price: { amount: 900 } },
      changes: [{ from: '2026-10-01', until: '2026-10-31', set: { price: { amount: 700 } } }, { from: '2026-11-15', until: '2026-11-30', set: { price: { amount: 800 } } }],
    })
    const later = await read({ 'content/menu/suppe.yml': offer }, new Date('2026-11-10T10:00:00Z'))
    expect(later.entries.menu?.[0]?.changes).toEqual([{ from: '2026-11-15', until: '2026-11-30', set: { price: { amount: 800 } } }])
  })

  // Wrong behaviour caught: `ginko check` tells the owner to write a holding offer into the field (it would stay after
  // the end), says nothing about one still to come, or nothing about one that has ended and only clutters the file.
  it('notes one still to come, warns about one that has ended, and says nothing to write for one that holds', async () => {
    const ended = 'name: Suppe\nprice: 9\n$changes:\n  - from: 2026-09-01\n    until: 2026-09-30\n    set: { price: 7 }\n'
    expect((await read({ 'content/menu/suppe.yml': offer })).warnings).toEqual([])
    expect((await read({ 'content/menu/suppe.yml': offer })).notes).toEqual([{ file: 'menu/suppe.yml', path: '$changes.1', message: 'A change from 2026-11-15 is still to come: a dated change in a file starts with the first build on or after its day. Build the site on that day, for example with a daily build.' }])
    expect((await read({ 'content/menu/suppe.yml': ended })).warnings).toEqual([{ file: 'menu/suppe.yml', path: '$changes.0', message: 'This change ended on 2026-09-30 and changes nothing any more: it can be deleted.' }])
  })

  it('the page gets the offer while it holds, with the normal value it covers', async () => {
    const s = site({ 'content/menu/suppe.yml': offer })
    const { bundles } = await buildFileBundles({ contentDir: s.content, publicDir: s.public, schema, drafts: false, now: NOW })
    const [item] = bundles.de!.bricks.menu?.kind === 'collection' ? bundles.de!.bricks.menu.items : []
    expect(item).toMatchObject({
      data: { price: { amount: 700, currency: 'EUR' } },
      holding: [{ from: '2026-10-01', until: '2026-10-31', data: { price: { amount: 700, currency: 'EUR' } }, normal: { price: { amount: 900, currency: 'EUR' } } }],
      upcoming: [{ from: '2026-11-15', until: '2026-11-30', data: { price: { amount: 800, currency: 'EUR' } } }],
    })
  })

  // Number 1 of slice 3: the file home against the table both homes share (the platform read is tested against the same
  // table in ginko-server/test/dated-until.test.ts).
  describe('number 1: the table of both homes', () => {
    const karte = serializeSchema(defineSite({
      site: 'karte', name: 'Karte', url: 'https://karte.example', timeZone: 'Europe/Vienna',
      locales: ['de'], currency: 'EUR', week: { firstDay: 'mo', workdays: ['mo', 'tu', 'we', 'th', 'fr'] }, pages: { home: '/' },
      bricks: {
        menu: collection({
          listing: { title: 'name' }, label: 'Karte', source: 'files', max: 20, order: 'manual',
          fields: { name: f.text('Name', { max: 40 }), price: f.money('Preis'), onMenu: f.boolean('Auf der Karte', { default: true }) },
          timeline: { public: ['price'] },
        }),
      },
    }))
    const written = (set: Record<string, unknown>) => Object.entries(set).map(([k, v]) => `${k}: ${k === 'price' ? (v as { amount: number }).amount / 100 : JSON.stringify(v)}`).join(', ')
    const file = [
      'name: Suppe', `price: ${(bothHomes.stored.price as { amount: number }).amount / 100}`, `onMenu: ${bothHomes.stored.onMenu}`, '$changes:',
      ...bothHomes.changes.flatMap((c) => [`  - from: ${c.from}`, ...(c.until ? [`    until: ${c.until}`] : []), `    set: { ${written(c.set)} }`]),
    ].join('\n')
    it.each(bothHomes.days)('%s', async (day, amount, onMenu) => {
      const s = site({ 'content/menu/suppe.yml': `${file}\n` })
      const { bundles, errors } = await buildFileBundles({ contentDir: s.content, publicDir: s.public, schema: karte, drafts: false, now: new Date(`${day}T10:00:00Z`) })
      expect(errors).toEqual([])
      const [item] = bundles.de!.bricks.menu?.kind === 'collection' ? bundles.de!.bricks.menu.items : []
      expect([item?.data.price, item?.data.onMenu]).toEqual([{ amount, currency: 'EUR' }, onMenu])
    })
  })
})

describe('what a page gets of a file with $changes', () => {
  it('the files bundle, the Markdown twin and the search hold today\'s values and only the public fields ahead', async () => {
    const s = site({ 'content/menu/suppe.yml': soup })
    const { bundles } = await buildFileBundles({ contentDir: s.content, publicDir: s.public, schema, drafts: false, now: NOW })
    const bundle = publicBundle(bundles.de!)
    const [item] = bundle.bricks.menu?.kind === 'collection' ? bundle.bricks.menu.items : []
    expect(item).toMatchObject({ data: { price: { amount: 950, currency: 'EUR' }, note: 'heiß' }, upcoming: [{ from: '2026-11-01', data: { price: { amount: 1050, currency: 'EUR' } } }] })
    const served = [JSON.stringify(bundle), await entryMarkdown(item!, 'menu', { schema }), JSON.stringify(await searchIndex(bundle, new Map(), schema))]
    for (const text of served) expect(text).not.toContain('Trüffelgeheimnis')
  })
})
