import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { main } from '../../src/cli/monorepo.ts'
import { parseExport } from '../../src/cli/model.ts'
import type { CliDeps } from '../../src/cli/run.ts'
import { collection, defineSite, f } from '../../src/core/index.ts'

// `blog` is a platform brick (no `source`): files-export reads content/<key>/ for every brick anyway.
const config = defineSite({
  site: 'linde', name: 'Linde', url: 'https://linde.example', timeZone: 'Europe/Vienna',
  locales: ['de', 'en'], currency: 'EUR', pages: { home: '/' },
  bricks: {
    blog: collection({
      label: 'Blog', max: 50, order: 'manual', route: { de: '/blog/[slug]', en: '/en/blog/[slug]' },
      fields: { title: f.text('Titel'), slug: f.slug('Adresse', { from: 'title' }), body: f.markdown('Text') },
    }),
    faq: collection({
      label: 'FAQ', source: 'files', max: 50, order: 'manual',
      fields: { question: f.text('Frage'), answer: f.longtext('Antwort') },
    }),
    authors: collection({
      label: 'Autorinnen', max: 20, order: 'manual',
      fields: { name: f.text('Name'), avatar: f.image('Bild', { optional: true }), bio: f.markdown('Über mich', { profile: 'rich', optional: true }) },
    }),
  },
})

const files: Record<string, string> = {
  'ginko.config.ts': `export default ${JSON.stringify(config)}\n`,
  'content/blog/1.hallo.md': '---\ntitle: Hallo Welt\n---\n\nErster Absatz.\n',
  'content/blog/1.hallo.en.md': '---\ntitle: Hello world\n---\n\nFirst paragraph.\n',
  'content/blog/2.zweiter.md': '---\ntitle: Zweiter\n---\n\nNur Deutsch.\n',
  'content/faq/1.preis.yml': 'question: Was kostet es?\nanswer: Das kommt darauf an.\n',
}

function run(argv: string[]) {
  const out: string[] = []
  const deps = { env: {}, git: async () => '', stdout: (t: string) => out.push(t), log: () => {}, fetch: async () => new Response() } as CliDeps
  return main(argv, deps).then((code) => ({ code, json: JSON.parse(out.join('')) as Record<string, unknown> }))
}

function site(extra: Record<string, string | Uint8Array> = {}) {
  const root = mkdtempSync(join(tmpdir(), 'ginko-files-export-'))
  for (const [path, text] of Object.entries({ ...files, ...extra })) {
    mkdirSync(dirname(join(root, path)), { recursive: true })
    writeFileSync(join(root, path), text)
  }
  return { root, config: join(root, 'ginko.config.ts'), out: join(root, 'out') }
}

describe('local:files-export', () => {
  it('turns content files into an export that parseExport accepts, translations included', async () => {
    const s = site()
    const { code, json } = await run(['files-export', '--config', s.config, s.out])
    expect(code).toBe(0)
    expect(json).toMatchObject({ ok: true, site: 'linde', entries: 3, bricks: { blog: 2, faq: 1 }, files: 0 })

    const exported = parseExport(JSON.parse(readFileSync(join(s.out, 'export.json'), 'utf8')), 'path', 'invalid')
    expect(exported.schema.bricks.blog).not.toHaveProperty('source')
    expect(exported.schema.bricks.faq).not.toHaveProperty('source')

    const [hallo, zweiter, preis] = exported.entries
    expect(hallo).toMatchObject({ id: 'blog/hallo', brick: 'blog', kind: 'item', order: 0, rev: 1 })
    expect(hallo!.data.title).toEqual({ de: 'Hallo Welt', en: 'Hello world' })
    expect(hallo!.data.slug).toEqual({ de: 'hallo', en: 'hallo' })
    // The platform stores and the Studio edits Markdown as text, not as the site's parsed tree.
    expect(hallo!.data.body).toEqual({ de: '\nErster Absatz.\n', en: '\nFirst paragraph.\n' })
    // A translation is fresh: it has a print for the main-language value.
    expect(Object.keys(hallo!.prints.title!)).toEqual(['en'])
    expect(zweiter!.data.title).toEqual({ de: 'Zweiter' })
    expect(preis).toMatchObject({ id: 'faq/preis', order: 0, data: { question: { de: 'Was kostet es?' }, answer: { de: 'Das kommt darauf an.' } } })
  })

  it('needs --config and refuses a folder that is not empty', async () => {
    const s = site()
    expect((await run(['files-export'])).code).toBe(2)
    await run(['files-export', '--config', s.config, s.out])
    expect((await run(['files-export', '--config', s.config, s.out])).code).toBe(2)
  })

  // Wrong behaviour caught: the export wrote no files and kept public/ paths, so on the platform every image of the
  // content vanished without an error; a type the Files library cannot hold went through unnoticed.
  it('exports a frontmatter image as a file and points the entry at it', async () => {
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAMAAAACCAIAAAASFvFNAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEElEQVQImWPQr/WCIAY4CwA5GgXF89GPfAAAAABJRU5ErkJggg==', 'base64')
    const H = createHash('sha256').update(png).digest('hex')
    const anna = '---\nname: Anna\navatar:\n  src: /images/a.png\n  alt: Ein Bild\n---\n\n![Anna im Garten](/images/team/a-copy.png)\n'
    const s = site({ 'public/images/a.png': png, 'public/images/team/a-copy.png': png, 'content/authors/1.anna.md': anna })
    const { code, json } = await run(['files-export', '--config', s.config, s.out])
    expect([code, json.files]).toEqual([0, 1])
    const exported = parseExport(JSON.parse(readFileSync(join(s.out, 'export.json'), 'utf8')), 'path', 'invalid')
    expect(exported.files).toEqual([{ id: H, name: 'a.png', mime: 'image/png', size: png.byteLength, width: 3, height: 2, sha256: H, original: true, path: `files/${H}.png`, folder: 'images' }])
    // The copy under images/team is the same picture: one file, and no empty folder for it.
    expect(exported.folders).toEqual([{ id: 'images', name: 'images' }])
    expect(readFileSync(join(s.out, `files/${H}.png`))).toEqual(png)
    const author = exported.entries.find((e) => e.id === 'authors/anna')!
    expect(author.data.avatar).toEqual({ file: H, alt: { de: 'Ein Bild' } })
    expect(author.data.bio).toEqual({ de: `\n![Anna im Garten]($file.${H})\n` })

    const avif = site({ 'public/images/b.avif': Buffer.from('AAAAHGZ0eXBhdmlmAAAAAG1pZjFhdmlmbWlhZgAAANZtZXRhAAAAAAAAACFoZGxyAAAAAAAAAABwaWN0AAAAAAAAAAAAAAAAAAAAACJpbG9jAAAAAERAAAEAAQAAAAAA+gABAAAAAAAAACMAAAAjaWluZgAAAAAAAQAAABVpbmZlAgAAAAABAABhdjAxAAAAAA5waXRtAAAAAAABAAAAVmlwcnAAAAA4aXBjbwAAAAxhdjFDgSACAAAAABRpc3BlAAAAAAAAAAMAAAACAAAAEHBpeGkAAAAAAwgICAAAABZpcG1hAAAAAAAAAAEAAQOBAgMAAAArbWRhdBIACgg4BCtICGg0gDIVGUJjBMAANAAAkEDJHGFSyVivY+eA', 'base64'), 'content/authors/1.anna.md': '---\nname: Anna\navatar:\n  src: /images/b.avif\n  alt: Ein Bild\n---\n' })
    const refused = await run(['files-export', '--config', avif.config, avif.out])
    expect(refused.code).toBe(1)
    expect(JSON.stringify(refused.json)).toMatch(/\(it takes JPEG, PNG and WebP images and PDF files\): \/images\/b\.avif\. Convert them/)
    expect(existsSync(avif.out)).toBe(false)
  })
})
