import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { main } from '../../src/cli/index.ts'
import { parseExport } from '../../src/cli/model.ts'
import type { CliDeps } from '../../src/cli/run.ts'
import { collection, defineComponents, defineSite, f, serializeSchema } from '../../src/core/index.ts'

const config = defineSite({
  site: 'linde', name: 'Linde', url: 'https://linde.example', timeZone: 'Europe/Vienna',
  locales: ['de', 'en'], currency: 'EUR', pages: { home: '/' },
  components: defineComponents({
    layout: { kind: 'block', label: 'Layout', describe: 'Columns', props: {} },
    column: { kind: 'block', label: 'Column', describe: 'One column', props: { width: f.text('Width') } },
  }),
  bricks: {
    blog: collection({
      label: 'Blog', max: 50, order: 'manual', route: { de: '/blog/[slug]', en: '/en/blog/[slug]' },
      fields: {
        title: f.text('Titel'), slug: f.slug('Adresse', { from: 'title' }), body: f.markdown('Text', { profile: 'rich' }),
        cover: f.image('Bild', { optional: true }),
        gallery: f.list('Galerie', { max: 5, itemLabel: "Bild", fields: { pic: f.image('Bild') } }),
      },
    }),
  },
})

// A 1x1 PNG, and the same picture with a changed comment chunk so that the bytes (and the hash) differ.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGD4DwABBAEAHnOcjQAAAABJRU5ErkJggg==', 'base64')
const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')

function setup(data: Record<string, unknown>) {
  const root = mkdtempSync(join(tmpdir(), 'ginko-prepare-'))
  const dir = join(root, 'folder')
  mkdirSync(dir)
  writeFileSync(join(root, 'ginko.config.ts'), `export default ${JSON.stringify(config)}\n`)
  const exported = {
    format: 1, site: 'linde', name: 'Linde', schema: serializeSchema(config), schemaRev: 1, contentRev: 1, exportedAt: '2026-10-01T00:00:00.000Z',
    entries: [{ id: 'hallo', brick: 'blog', kind: 'item', order: 0, prints: {}, rev: 1, data: { title: { de: 'Hallo' }, slug: { de: 'hallo', en: 'hello' }, ...data } }],
    folders: [], files: [],
  }
  writeFileSync(join(dir, 'export.json'), `${JSON.stringify(exported, null, 2)}\n`)
  return { root, dir, config: join(root, 'ginko.config.ts'), map: join(root, 'map.json') }
}

/** Runs `ginko prepare-import`; `responses` maps an address to a Response (default 404) and `calls` records every request. */
async function run(s: ReturnType<typeof setup>, map: object, responses: Record<string, () => Response> = {}) {
  writeFileSync(s.map, JSON.stringify(map))
  const calls: string[] = []
  const out: string[] = []
  const deps = {
    env: {}, git: async () => '', stdout: (t: string) => out.push(t), log: () => {},
    fetch: async (url: string) => { calls.push(url); return (responses[url] ?? (() => new Response('', { status: 404 })))() },
  } as CliDeps
  const code = await main(['prepare-import', s.dir, '--map', s.map, '--config', s.config], deps)
  return { code, calls, json: JSON.parse(out.join('')) as Record<string, any> }
}
const png = () => new Response(PNG, { headers: { 'content-type': 'image/png' } })
const readExport = (s: { dir: string }) => parseExport(JSON.parse(readFileSync(join(s.dir, 'export.json'), 'utf8')), 'path', 'invalid')
const body = (s: { dir: string }) => (readExport(s).entries[0]!.data as Record<string, any>)

describe('ginko prepare-import', () => {
  it('stores images once per hash and references them as $file.<sha>', async () => {
    const s = setup({
      cover: { url: 'https://old.example/a.png', alt: 'Linde' },
      gallery: [{ pic: 'https://old.example/b.png' }],
      body: { de: 'Text ![Baum](https://old.example/a.png) und ![Zwei](https://old.example/b.png "Titel")' },
    })
    const { code, calls, json } = await run(s, {}, { 'https://old.example/a.png': png, 'https://old.example/b.png': png })
    const id = sha(PNG)
    expect(code).toBe(0)
    expect(calls.sort()).toEqual(['https://old.example/a.png', 'https://old.example/b.png'])
    expect(json.images).toEqual({ downloaded: 1, reused: 3, failed: [] })
    expect(body(s).cover).toEqual({ file: id, alt: { de: 'Linde' } })
    expect(body(s).gallery).toEqual([{ pic: { file: id } }])
    expect(body(s).body.de).toBe(`Text ![Baum]($file.${id}) und ![Zwei]($file.${id} "Titel")`)
    const exported = readExport(s)
    expect(exported.files).toEqual([{ id, name: 'a.png', mime: 'image/png', size: PNG.length, width: 1, height: 1, sha256: id, original: true, folder: 'imported', path: `files/${id}.png` }])
    expect(exported.folders).toEqual([{ id: 'imported', name: 'imported' }])
    expect(readFileSync(join(s.dir, exported.files[0]!.path))).toEqual(PNG)
  })

  it('leaves a failed image as it is, reports it and still finishes with exit 1', async () => {
    const s = setup({ cover: { url: 'https://old.example/gone.png' }, gallery: [{ pic: 'https://old.example/anim.gif' }, { pic: 'https://old.example/ok.png' }] })
    const { code, json } = await run(s, {}, {
      'https://old.example/anim.gif': () => new Response('GIF89a', { headers: { 'content-type': 'image/gif' } }),
      'https://old.example/ok.png': png,
    })
    expect(code).toBe(1)
    expect(json.ok).toBe(false)
    expect(json.images.downloaded).toBe(1)
    expect(json.images.failed).toEqual([
      // A GIF is an image, but the platform would refuse it at import, after the old address is gone.
      { url: 'https://old.example/anim.gif', reason: 'type “image/gif” is not JPEG, PNG, WebP' },
      { url: 'https://old.example/gone.png', reason: 'HTTP 404' },
    ])
    expect(body(s).cover).toEqual({ url: 'https://old.example/gone.png' })
    expect(body(s).gallery[0]).toEqual({ pic: 'https://old.example/anim.gif' })
    expect(body(s).gallery[1].pic.file).toBe(sha(PNG))
  })

  it('renames components and attributes, and lists tags the registry does not know', async () => {
    const s = setup({ body: { de: '::ginko-layout\n:::ginko-column{size="half" id="a"}\nText :ginko-chip[neu]\n:::\n:::ginko-column\nZwei\n:::\n::\n\n::banner{x="1"}' } })
    const { code, json } = await run(s, { components: {
      'ginko-layout': 'layout', 'ginko-column': { tag: 'column', attributes: { size: 'width' } },
    } })
    expect(code).toBe(0)
    expect(body(s).body.de).toBe('::layout\n:::column{width="half" id="a"}\nText :ginko-chip[neu]\n:::\n:::column\nZwei\n:::\n::\n\n::banner{x="1"}')
    expect(json.components).toEqual({ renamed: 3, unknown: ['banner', 'ginko-chip'] })
  })

  it('resolves a redirect to brick/id through the route of the old path\'s language and keeps plain targets', async () => {
    const s = setup({})
    const { code, json } = await run(s, { redirects: { '/alt/hallo': 'blog/hallo', '/en/old/hallo': 'blog/hallo', '/kontakt': '/de/kontakt', '/x': 'blog/missing' } })
    expect(code).toBe(1)
    expect(json.redirects.problems).toEqual(['"/x": no entry “blog/missing” in export.json.'])
    expect(json.redirects.count).toBe(3)
    expect(json.redirects.file).toBe(join(s.dir, 'redirects.json'))
    expect(JSON.parse(readFileSync(join(s.dir, 'redirects.json'), 'utf8'))).toEqual([
      { from: '/alt/hallo', to: '/blog/hallo' },
      { from: '/en/old/hallo', to: '/en/blog/hello' },
      { from: '/kontakt', to: '/de/kontakt' },
    ])
  })

  it('does nothing on a second run: no download, no new backup, same files', async () => {
    const s = setup({ cover: { url: 'https://old.example/a.png' }, body: { de: '::old\n::\n' } })
    const map = { components: { old: 'layout' }, redirects: { '/alt': 'blog/hallo' } }
    await run(s, map, { 'https://old.example/a.png': png })
    const snapshot = ['export.json', 'export.json.bak', 'redirects.json'].map((name) => readFileSync(join(s.dir, name), 'utf8'))
    const second = await run(s, map)
    expect(second.code).toBe(0)
    expect(second.calls).toEqual([])
    expect(second.json.images).toEqual({ downloaded: 0, reused: 0, failed: [] })
    expect(['export.json', 'export.json.bak', 'redirects.json'].map((name) => readFileSync(join(s.dir, name), 'utf8'))).toEqual(snapshot)
    expect(existsSync(join(s.dir, 'export.json.bak'))).toBe(true)
    expect(JSON.parse(snapshot[1]!).entries[0].data.cover).toEqual({ url: 'https://old.example/a.png' })
  })
})
