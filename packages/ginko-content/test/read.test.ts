// Files → stored entries (CONTENT.md "Dateien"). Each test writes its own content folder.
import { mkdirSync, mkdtempSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import { collection, defineSite, f, single } from '@lupinum/ginko'
import { serializeSchema } from '@lupinum/ginko/internal'
import { buildFileBundles, readContent } from '../src/index.ts'

const schema = serializeSchema(defineSite({
  site: 'doku', name: 'Doku', url: 'https://doku.example', timezone: 'Europe/Vienna',
  locales: ['de', 'en'], currency: 'EUR', pages: { home: { de: '/', en: '/en' } },
  bricks: {
    docs: collection({
      label: 'Doku', source: 'files', max: 50, order: 'manual',
      route: { de: '/doku/[slug]', en: '/en/docs/[slug]' },
      fields: {
        title: f.text('Titel'),
        slug: f.slug('Adresse', { from: 'title' }),
        price: f.money('Preis', { optional: true }),
        hero: f.image('Bild', { optional: true }),
        steps: f.list('Schritte', 'Schritt', { label: f.text('Name') }, { max: 10, optional: true }),
        body: f.markdown('Text'),
      },
    }),
    pages: collection({
      label: 'Seiten', source: 'files', max: 5, order: 'manual',
      route: { de: '/seite/[slug]', en: '/en/page/[slug]' },
      fields: { title: f.text('Titel'), slug: f.slug('Adresse', { from: 'title' }), body: f.markdown('Text', { profile: 'page' }) },
    }),
    legal: single({ label: 'Rechtliches', source: 'files', fields: { title: f.text('Titel'), body: f.markdown('Text') } }),
    notices: collection({ label: 'Hinweise', max: 5, order: 'manual', fields: { text: f.text('Text') } }),
  },
  components: {
    figure: { kind: 'block', label: 'Bild', describe: 'Bild mit Maßen', props: { src: f.image('Bild'), width: f.number('Breite', { min: 1, max: 10000, step: 1, optional: true }), height: f.number('Höhe', { min: 1, max: 10000, step: 1, optional: true }) } },
  },
}))

/** A site folder with `content/` and `public/` from a map of relative paths to file contents. */
function site(files: Record<string, string>) {
  const root = mkdtempSync(join(tmpdir(), 'ginko-content-'))
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true })
    writeFileSync(join(root, path), text)
  }
  return { content: join(root, 'content'), public: join(root, 'public') }
}
const md = (front: string, body = 'Text.') => `---\n${front}\n---\n\n${body}\n`
const read = (files: Record<string, string>) => { const s = site(files); return readContent(s.content, s.public, schema) }

describe('readContent', () => {
  it('reads a collection entry with its translation, order and slugs', async () => {
    const r = await read({
      'content/docs/2.bausteine.md': md('title: Bausteine'),
      'content/docs/1.einstieg.md': md('title: Einstieg'),
      'content/docs/1.einstieg.en.md': md('title: Getting started\nslug: getting-started'),
    })
    expect(r.errors).toEqual([])
    expect(r.entries.docs!.map((e) => [e.id, e.order, e.data.title, e.data.slug])).toEqual([
      ['docs/einstieg', 1, { de: 'Einstieg', en: 'Getting started' }, { de: 'einstieg', en: 'getting-started' }],
      ['docs/bausteine', 2, { de: 'Bausteine' }, { de: 'bausteine' }],
    ])
    expect((r.entries.docs![0]!.data.body as { de: { nodes: unknown[] } }).de.nodes.length).toBeGreaterThan(0)
  })

  it('reads a single and never touches platform bricks', async () => {
    const r = await read({ 'content/legal.md': md('title: Impressum'), 'content/legal.en.md': md('title: Imprint') })
    expect(r.errors).toEqual([])
    expect(r.entries.legal!.map((e) => [e.id, e.data.title])).toEqual([['legal', { de: 'Impressum', en: 'Imprint' }]])
    expect(r.entries.notices).toBeUndefined()
  })

  it('turns simple frontmatter forms into the stored format', async () => {
    const r = await read({
      'public/img/a.svg': '<svg width="40" height="30"></svg>',
      'content/docs/1.a.md': md('title: A\nprice: 12.5\nhero:\n  src: /img/a.svg\n  alt: Ein Bild\nsteps:\n  - label: Eins\n  - label: Zwei'),
      'content/docs/1.a.en.md': md('title: A\nhero:\n  alt: A picture\nsteps:\n  - One\n  - Two'),
    })
    expect(r.errors).toEqual([])
    const data = r.entries.docs![0]!.data
    expect(data.price).toEqual({ amount: 1250 })
    expect(data.hero).toEqual({ file: '/img/a.svg', alt: { de: 'Ein Bild', en: 'A picture' } })
    const steps = data.steps as { _id: string; label: Record<string, string> }[]
    expect(steps.map((s) => s.label)).toEqual([{ de: 'Eins', en: 'One' }, { de: 'Zwei', en: 'Two' }])
    expect(steps.every((s) => /^[A-Za-z0-9_-]{10}$/.test(s._id))).toBe(true)
    // An image registers its pixel size.
    expect(r.files['/img/a.svg']).toEqual({ url: '/img/a.svg', name: 'a.svg', size: 34, width: 40, height: 30 })
  })

  it.each([
    ['an unknown frontmatter key', { 'content/docs/1.a.md': md('title: A\ncolour: red') }, 'docs/1.a.md', /colour/],
    ['a locale the site does not have', { 'content/docs/1.a.md': md('title: A'), 'content/docs/1.a.fr.md': md('title: A') }, 'docs/1.a.fr.md', /fr/],
    ['a translation without its main file', { 'content/docs/1.a.en.md': md('title: A') }, 'docs/1.a.en.md', /./],
    ['two entries with the same slug', { 'content/docs/1.a.md': md('title: A\nslug: x'), 'content/docs/2.b.md': md('title: B\nslug: x') }, 'docs/2.b.md', /x/],
    ['a URL clash from the slug fallback (A has no English slug, B has "intro")', { 'content/docs/1.a.md': md('title: A\nslug: intro'), 'content/docs/2.b.md': md('title: B\nslug: other'), 'content/docs/2.b.en.md': md('title: B\nslug: intro') }, 'docs/2.b.en.md', /intro/],
    ['a missing image', { 'content/docs/1.a.md': md('title: A\nhero:\n  src: /img/none.png\n  alt: Weg') }, 'docs/1.a.md', /none\.png/],
    ['a body the field profile does not allow (h1 in a rich field)', { 'content/docs/1.a.md': md('title: A', '# Zu gross') }, 'docs/1.a.md', /h1/],
    ['a validation error (empty title)', { 'content/docs/1.a.md': md("title: ''") }, 'docs/1.a.md', /Titel/],
  ])('reports %s with the file, and still reads the rest', async (_, files, file, message) => {
    const r = await read({ ...files, 'content/docs/9.ok.md': md('title: Gut') })
    expect(r.errors.some((e) => e.file === file && message.test(e.message + (e.path ?? '')))).toBe(true)
    expect(r.entries.docs!.some((e) => e.id === 'docs/ok')).toBe(true)
  })
})

describe('buildFileBundles', () => {
  it('builds one bundle per locale with URLs, and falls back to the main language', async () => {
    const s = site({ 'content/docs/1.einstieg.md': md('title: Einstieg'), 'content/docs/2.nur-de.md': md('title: Nur Deutsch'), 'content/docs/1.einstieg.en.md': md('title: Getting started\nslug: getting-started', 'English text.') })
    const { bundles, errors } = await buildFileBundles(s.content, s.public, schema)
    expect(errors).toEqual([])
    const en = bundles.en!.bricks.docs!
    expect(en.kind === 'collection' && en.items.map((i) => [i.data.title, i.urls, i.fallback.includes('title'), i.fallback.includes('body')])).toEqual([
      // A translated Markdown body is the translation, not a stale fallback (its print is of the main tree).
      ['Getting started', { de: '/doku/einstieg', en: '/en/docs/getting-started' }, false, false],
      ['Nur Deutsch', { de: '/doku/nur-de', en: '/en/docs/nur-de' }, true, true],
    ])
    expect(Object.keys(bundles.de!.bricks)).toEqual(['docs', 'pages', 'legal'])
  })

  // Wrong behaviour caught: items without the file they come from or without the time of their newest file (translations included).
  it('items carry source (the file of their locale, else the main file) and updatedAt (newest of their files)', async () => {
    const s = site({ 'content/docs/1.einstieg.md': md('title: Einstieg'), 'content/docs/1.einstieg.en.md': md('title: Getting started'), 'content/docs/2.zwei.md': md('title: Zwei') })
    utimesSync(join(s.content, 'docs/1.einstieg.md'), new Date('2026-01-01T00:00:00Z'), new Date('2026-01-01T00:00:00Z'))
    utimesSync(join(s.content, 'docs/1.einstieg.en.md'), new Date('2026-02-01T00:00:00Z'), new Date('2026-02-01T00:00:00Z'))
    utimesSync(join(s.content, 'docs/2.zwei.md'), new Date('2026-03-01T00:00:00Z'), new Date('2026-03-01T00:00:00Z'))
    const { bundles } = await buildFileBundles(s.content, s.public, schema)
    const docs = bundles.de!.bricks.docs!
    expect(docs.kind === 'collection' && docs.items.map((i) => [i.id, i.source, i.updatedAt])).toEqual([
      ['docs/einstieg', 'content/docs/1.einstieg.md', '2026-02-01T00:00:00.000Z'],
      ['docs/zwei', 'content/docs/2.zwei.md', '2026-03-01T00:00:00.000Z'],
    ])
    // "Edit this page" on the English page must open the English file.
    const en = bundles.en!.bricks.docs!
    expect(en.kind === 'collection' && en.items.map((i) => i.source)).toEqual(['content/docs/1.einstieg.en.md', 'content/docs/2.zwei.md'])
  })
})

describe('images in Markdown', () => {
  const svg = '<svg width="40" height="30"></svg>'
  const bodyJson = (r: Awaited<ReturnType<typeof read>>) => JSON.stringify((r.entries.docs![0]!.data.body as { de: { nodes: unknown[] } }).de.nodes)

  it('moves a co-located image to a content-addressed URL with its size', async () => {
    const r = await read({
      'content/docs/1.a.md': md('title: A', '![Alt](./cover.svg)'),
      'content/docs/cover.svg': svg,
    })
    expect(r.errors).toEqual([])
    const [url] = [...r.images.keys()]
    expect(url).toMatch(/^\/_ginko\/img\/[0-9a-f]{16}\.svg$/)
    expect(bodyJson(r)).toContain(`{"src":"${url}","alt":"Alt","width":40,"height":30}`)
  })

  it('resolves ../ against the file folder and accepts a bare file name', async () => {
    const r = await read({
      'content/docs/1.a.md': md('title: A', '![A](../shared/x.svg)\n\n![B](y.svg)'),
      'content/shared/x.svg': svg,
      'content/docs/y.svg': '<svg width="10" height="10"></svg>',
    })
    expect(r.errors).toEqual([])
    expect(r.images.size).toBe(2)
  })

  it.each([
    ['outside content/', '![A](../../escape.svg)', 'liegt außerhalb von content/'],
    ['missing', '![A](./nope.svg)', 'fehlt'],
  ])('reports an image that is %s with its file', async (_name, body, message) => {
    const r = await read({ 'content/docs/1.a.md': md('title: A', body), 'escape.svg': svg })
    expect(r.errors.filter((e) => e.file === 'docs/1.a.md' && e.message.includes(message))).toHaveLength(1)
    expect(r.entries.docs ?? []).toEqual([])
  })

  it('adds the size to a public image and leaves remote images alone', async () => {
    const r = await read({
      'public/img/a.svg': svg,
      'content/docs/1.a.md': md('title: A', '![A](/img/a.svg)\n\n![R](https://example.com/r.jpg)'),
    })
    expect(r.errors).toEqual([])
    const json = bodyJson(r)
    expect(json).toContain('{"src":"/img/a.svg","alt":"A","width":40,"height":30}')
    expect(json).toContain('{"src":"https://example.com/r.jpg","alt":"R"}')
    expect(r.images.size).toBe(0)
  })

  // Bug caught: a relative image prop of a component reached validate() unchanged, so it failed as an unsafe URL.
  it('moves an image prop of a component to a content-addressed URL with its size', async () => {
    const r = await read({
      'content/pages/1.a.md': md('title: A', '::figure{src="./cover.svg"}'),
      'content/pages/cover.svg': svg,
    })
    expect(r.errors).toEqual([])
    const [url] = [...r.images.keys()]
    expect(url).toMatch(/^\/_ginko\/img\/[0-9a-f]{16}\.svg$/)
    const body = JSON.stringify((r.entries.pages![0]!.data.body as { de: { nodes: unknown[] } }).de.nodes)
    expect(body).toContain(`"src":"${url}"`)
    expect(body).toContain('"width":40')
  })

  it('reports a component image prop that is missing, with its file', async () => {
    const r = await read({ 'content/pages/1.a.md': md('title: A', '::figure{src="./nope.svg"}') })
    expect(r.errors.filter((e) => e.file === 'pages/1.a.md' && e.message.includes('fehlt'))).toHaveLength(1)
  })

  // Bug caught: a co-located image got no srcset, so phones downloaded the full-size original.
  it.each([
    ['2000 px', 2000],
    ['400 px', 400],
  ])('reads a co-located %s PNG and sets its srcset only when a WebP copy is narrower', async (_name, width) => {
    const root = mkdtempSync(join(tmpdir(), 'ginko-content-'))
    mkdirSync(join(root, 'content/docs'), { recursive: true })
    writeFileSync(join(root, 'content/docs/kueche.png'), await sharp({ create: { width, height: 100, channels: 3, background: '#c33' } }).png().toBuffer())
    writeFileSync(join(root, 'content/docs/1.a.md'), md('title: A', '![Küche](./kueche.png)'))
    const r = await readContent(join(root, 'content'), join(root, 'public'), schema)
    expect(r.errors).toEqual([])
    const url = [...r.images.keys()][0]!
    const hash = url.slice('/_ginko/img/'.length, -'.png'.length)
    const srcset = width === 2000
      ? `/_ginko/img/${hash}-480.webp 480w, /_ginko/img/${hash}-960.webp 960w, /_ginko/img/${hash}-1600.webp 1600w, ${url} 2000w`
      : undefined
    expect(bodyJson(r)).toContain(srcset
      ? `{"src":"${url}","alt":"Küche","width":2000,"height":100,"srcset":"${srcset}","sizes":"100vw"}`
      : `{"src":"${url}","alt":"Küche","width":400,"height":100}`)
  })
})

describe('image variants', () => {
  const imageSchema = serializeSchema(defineSite({
    site: 'doku', name: 'Doku', url: 'https://doku.example', timezone: 'Europe/Vienna',
    locales: ['de'], currency: 'EUR', pages: { home: { de: '/' } },
    bricks: { docs: collection({ label: 'Doku', source: 'files', max: 50, order: 'manual', route: { de: '/doku/[slug]' }, fields: { title: f.text('Titel'), slug: f.slug('Adresse', { from: 'title' }), hero: f.image('Bild', { optional: true }), body: f.markdown('Text') } }) },
  }))
  const png = (width: number, height: number) => sharp({ create: { width, height, channels: 3, background: '#c33' } }).png().toBuffer()

  // Bug caught: srcset needs the copies on disk and on the image value; a missing file or a wider-than-image copy breaks the page.
  it.each([
    ['2000 px wide', 2000, [480, 960, 1600]],
    ['600 px wide', 600, [480]],
    ['480 px wide', 480, []],
  ])('makes WebP copies of a %s image narrower than itself', async (_name, width, widths) => {
    const root = mkdtempSync(join(tmpdir(), 'ginko-variants-'))
    mkdirSync(join(root, 'public/img'), { recursive: true })
    mkdirSync(join(root, 'content/docs'), { recursive: true })
    writeFileSync(join(root, 'public/img/a.png'), await png(width, 100))
    writeFileSync(join(root, 'content/docs/1.a.md'), md('title: A\nhero:\n  src: /img/a.png\n  alt: Rot'))
    const imageDir = join(root, 'out')
    const { bundles, imageFiles, errors } = await buildFileBundles(join(root, 'content'), join(root, 'public'), imageSchema, new Date(), { imageDir })
    expect(errors).toEqual([])
    const hero = (bundles.de!.bricks.docs as unknown as { items: { data: { hero: { variants?: { width: number; url: string }[] } } }[] }).items[0]!.data.hero
    expect(hero.variants?.map((v) => v.width)).toEqual(widths.length ? widths : undefined)
    for (const v of hero.variants ?? []) {
      expect(v.url).toMatch(new RegExp(`^/_ginko/img/[0-9a-f]{16}-${v.width}\\.webp$`))
      const meta = await sharp(join(imageDir, v.url.split('/').pop()!)).metadata()
      expect([meta.format, meta.width]).toEqual(['webp', v.width])
    }
    expect(imageFiles.size).toBe(widths.length)
  })

  it('makes no variants of an SVG', async () => {
    const root = mkdtempSync(join(tmpdir(), 'ginko-variants-'))
    mkdirSync(join(root, 'public/img'), { recursive: true })
    mkdirSync(join(root, 'content/docs'), { recursive: true })
    writeFileSync(join(root, 'public/img/a.svg'), '<svg width="2000" height="1000"></svg>')
    writeFileSync(join(root, 'content/docs/1.a.md'), md('title: A\nhero:\n  src: /img/a.svg\n  alt: Rot'))
    const { bundles, imageFiles } = await buildFileBundles(join(root, 'content'), join(root, 'public'), imageSchema, new Date(), { imageDir: join(root, 'out') })
    expect(imageFiles.size).toBe(0)
    expect(JSON.stringify(bundles.de)).not.toContain('variants')
  })
})
