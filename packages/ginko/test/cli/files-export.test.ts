import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
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

function site() {
  const root = mkdtempSync(join(tmpdir(), 'ginko-files-export-'))
  for (const [path, text] of Object.entries(files)) {
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
})
