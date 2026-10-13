import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { main } from '../../src/cli/index.ts'
import { collection, defineSite, f } from '../../src/core/index.ts'

// One file brick (docs/<name>.md) with a route, and a home page that a link can point to.
const config = defineSite({
  site: 'linde', name: 'Linde', url: 'https://linde.example', timezone: 'Europe/Vienna',
  locales: ['de'], currency: 'EUR', pages: { home: '/' },
  bricks: {
    docs: collection({
      label: 'Doku', source: 'files', max: 50, order: 'manual',
      route: { de: '/doku/[slug]' },
      fields: { title: f.text('Titel'), slug: f.slug('Adresse', { from: 'title' }), body: f.markdown('Text') },
    }),
  },
})

/** A site folder: ginko.config.ts (a plain module, so the test needs no imports), content/ and public/. */
function siteWith(markdown: string, site: object = config) {
  const root = mkdtempSync(join(tmpdir(), 'ginko-check-'))
  const files: Record<string, string> = {
    'ginko.config.ts': `export default ${JSON.stringify(site)}\n`,
    'content/docs/einstieg.md':`---\ntitle: Einstieg\n---\n\n${markdown}\n`,
  }
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true })
    writeFileSync(join(root, path), text)
  }
  return join(root, 'ginko.config.ts')
}

/** The exit code and the report on stderr, without the closing line of a failed check. */
async function runCheck(configPath: string, argv: string[] = []) {
  const lines: string[] = []
  const stdout: string[] = []
  const code = await main(['check', '--config', configPath, ...argv], {
    env: {}, // a site of file bricks only needs no platform
    git: async () => '',
    stdout: (text) => stdout.push(text),
    log: (line) => lines.push(line),
    fetch: async () => { throw new Error('no platform call expected') },
  })
  const result = JSON.parse(stdout.join('')) as { ok: boolean }
  return { code, lines: result.ok ? lines : lines.slice(0, -1), result }
}

describe('ginko check and links in content files', () => {
  it('reports a broken route link and exits 1', async () => {
    const { code, lines } = await runCheck(siteWith('Siehe [Nichts]($page.nope).'))
    expect(lines.filter((l) => l.startsWith('content/'))).toEqual([expect.stringContaining('content/docs/einstieg')])
    expect(lines.find((l) => l.startsWith('content/'))).toContain('$page.nope')
    expect(code).toBe(1)
  })

  // Wrong behaviour caught: `ginko check` says OK while every page's og:image is a 404.
  it('reports a seo.image that is missing from public/ and exits 1', async () => {
    const site = { ...config, seo: { image: '/og.png' } }
    const path = siteWith('Siehe [Start]($page.home).', site)
    const missing = await runCheck(path)
    expect(missing.lines).toEqual([expect.stringContaining('seo.image "/og.png" is missing')])
    expect(missing.lines[0]).toContain('public/og.png')
    expect(missing.code).toBe(1)
    mkdirSync(join(dirname(path), 'public'))
    writeFileSync(join(dirname(path), 'public/og.png'), '')
    expect(await runCheck(path)).toMatchObject({ code: 0, lines: ['OK: schema and links are fine.'] })
    // An absolute URL is not looked up in public/.
    expect((await runCheck(siteWith('Siehe [Start]($page.home).', { ...config, seo: { image: 'https://cdn.example/og.png' } }))).code).toBe(0)
  })

  it('prints only the OK line for a clean site and exits 0', async () => {
    const { code, lines, result } = await runCheck(siteWith('Siehe [Start]($page.home).'))
    expect(lines).toEqual(['OK: schema and links are fine.'])
    expect(result).toEqual({ ok: true, compared: false })
    expect(code).toBe(0)
  })

  // Wrong behaviour caught: a pull request from a fork has no GINKO_KEY, and check fails before it checks anything.
  it('--offline checks a site with platform bricks without the platform and says it skipped the comparison', async () => {
    const news = collection({ label: 'News', max: 10, order: 'manual', fields: { title: f.text('Titel') } })
    const path = siteWith('Siehe [Start]($page.home).', { ...config, bricks: { ...config.bricks, news } })
    expect((await runCheck(path)).result).toMatchObject({ ok: false, error: { code: 'USAGE' } })
    const offline = await runCheck(path, ['--offline'])
    expect(offline.lines).toEqual(['OK: schema and links are fine.', 'Skipped the comparison with production (--offline).'])
    expect(offline.result).toEqual({ ok: true, compared: false })
    expect(offline.code).toBe(0)
  })

  it('reports an invalid config and exits 1', async () => {
    // Pages are keyed by name, not by locale: the Nuxt build rejects this config.
    const { code, lines } = await runCheck(siteWith('Text.', { ...config, pages: { de: ['/'] } }))
    expect(lines[0]).toBe('ginko.config.ts is invalid:')
    expect(lines[1]).toContain('pages.de')
    expect(code).toBe(1)
  })

  // Bug caught: the content package knows the line of a CSV row, but `ginko check` printed only the file and field.
  it('prints the line of a data file error', async () => {
    const menu = collection({ label: 'Karte', source: 'files', max: 50, order: 'manual', fields: { title: f.text('Titel'), price: f.number('Preis', { min: 0, max: 100, step: 0.1 }) } })
    const path = siteWith('Text.', { ...config, bricks: { ...config.bricks, menu } })
    mkdirSync(join(dirname(path), 'content/menu'))
    writeFileSync(join(dirname(path), 'content/menu/preise.csv'), 'slug,title,price\nkaffee,Kaffee,"3,5"\n')
    const { code, lines } = await runCheck(path)
    expect(lines).toContainEqual(expect.stringMatching(/^content\/menu\/preise\.csv:2 \(price\): Column “price”/))
    expect(code).toBe(1)
  })
})
